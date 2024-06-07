const express = require('express');
const app = express();
const port = process.env.PORT || 4000;
const AWS = require('aws-sdk');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const cron = require('node-cron');
const twilio = require('twilio');
require('dotenv').config();

AWS.config.update({ region: 'us-east-1' });
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();


const twilioClient = twilio('AC1f39abf23cbe3d99676f15fadc70c59f', '6e2377cc97d6b3236a46f68c124fbf11');

const upload = multer({
  storage: multer.memoryStorage()
});


app.use(cors());
app.use(express.json());


async function sendWhatsAppMessage(to, body) {
  try {
    await twilioClient.messages.create({
      from: `whatsapp:${'+14155238886'}`,
      to: `whatsapp:${to}`,
      body: body
    });
    console.log('WhatsApp message sent successfully');
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
  }
}


app.post('/cars', upload.fields([
  { name: 'Coverimage', maxCount: 1 },
  { name: 'RcFront', maxCount: 1 },
  { name: 'RcBack', maxCount: 1 },
  { name: 'AdhaarFront', maxCount: 1 },
  { name: 'AdhaarBack', maxCount: 1 },
  { name: 'Insurance', maxCount: 1 },
  { name: 'Pollution', maxCount: 1 },
  { name: 'Images', maxCount: 50 },
  { name: 'AgreementDoc', maxCount: 1 }
]), async (req, res) => {
  try {
    
    const carId = uuidv4();

   
    const carItem = {
      G7cars123: carId,
      ...req.body,
      status: 'Available'
    };


    const imageFields = ['Coverimage', 'RcFront', 'RcBack', 'AdhaarFront', 'AdhaarBack', 'Insurance', 'Pollution', 'AgreementDoc'];
    for (const field of imageFields) {
      if (req.files[field] && req.files[field].length > 0) {
        const images = req.files[field];
        const imageUrls = [];
        for (const image of images) {
          const params = {
            Bucket: 'g7cars',
            Key: image.originalname,
            Body: image.buffer
          };
          const data = await s3.upload(params).promise();
          imageUrls.push(data.Location);
        }
        carItem[field] = imageUrls;
      }
    }


    const params = {
      TableName: 'G7Cars',
      Item: carItem,
    };
    await dynamoDb.put(params).promise();

    res.status(200).send('Uploaded data and images successfully');
  } catch (error) {
    console.error('Unable to post details', error);
    res.status(500).send('Unable to post details to DynamoDB');
  }
});


const rzp = new Razorpay({
  key_id: process.env.RAZORPAY_API_KEY,
  key_secret: 'EaXIwNI6oDhQX6ul7UjWrv25',
});


app.post('/order', (req, res) => {
  const options = {
    amount: req.body.amount * 100,
    currency: "INR",
    receipt: "order_rcptid_11"
  };

  rzp.orders.create(options, function (err, order) {
    if (err) {
      console.error('Error creating order:', err);
      res.status(500).json({
        message: "Order creation failed",
        error: err
      });
    } else {
      res.status(200).json({ orderId: order.id });
    }
  });
});


const generateSignature = (paymentId, orderId, secret) => {
  const data = `${orderId}|${paymentId}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  const signature = hmac.digest('hex');
  return signature;
};


app.post('/verify', async (req, res) => {
  const { paymentId, orderId, signature: razorpay_signature, carId, pickupDateTime, dropoffDateTime } = req.body;

  const secret = 'EaXIwNI6oDhQX6ul7UjWrv25';
  const generated_signature = generateSignature(paymentId, orderId, secret);
  const verificationSucceeded = (generated_signature === razorpay_signature);


  if (verificationSucceeded) {
    try {
      const bookingId = uuidv4();
      const booking = {
        bookingId,
        carId,
        pickupDateTime,
        dropoffDateTime,
        createdAt: new Date().toISOString(),
        status: 'confirmed',
        paymentId: paymentId
      };

 
      const updateParams = {
        TableName: 'G7Cars',
        Key: { G7cars123: carId },
        UpdateExpression: 'SET #bookings = list_append(if_not_exists(#bookings, :empty_list), :booking)',
        ExpressionAttributeNames: {
          '#bookings': 'bookings'
        },
        ExpressionAttributeValues: {
          ':booking': [booking],
          ':empty_list': []
        },
        ReturnValues: 'ALL_NEW'
      };
      await dynamoDb.update(updateParams).promise();

      const messageBody = `Booking confirmed! \nBooking ID: ${bookingId}\nCar ID: ${carId}\nPickup DateTime: ${pickupDateTime}\nDropoff DateTime: ${dropoffDateTime}`;
      await sendWhatsAppMessage(process.env.WHATSAPP_NUMBER_1, messageBody);
      await sendWhatsAppMessage(process.env.WHATSAPP_NUMBER_2, messageBody);

      res.status(200).json({ status: 'success' });
    } catch (error) {
      console.error('Error confirming payment and updating status:', error);
      res.status(500).json({ status: 'failure', message: 'Failed to update booking and car status' });
    }
  } else {
    console.log('Payment verification failed');
    res.status(400).json({ status: 'failure' });
  }
});

app.get('/cars', async (req, res) => {
  try {
    const { pickupDateTime, dropoffDateTime } = req.query;
    const carsData = await dynamoDb.scan({ TableName: 'G7Cars' }).promise();
    const cars = carsData.Items;

    const availableCars = cars.map(car => {
      const isCarAvailable = isCarAvailableForTimeSlot(car, pickupDateTime, dropoffDateTime);
      return {
        ...car,
        status: isCarAvailable ? 'Available' : 'Not available'
      };
    });

    res.json(availableCars);
  } catch (error) {
    console.error('Error fetching available cars:', error);
    res.status(500).send('Unable to fetch available cars');
  }
});


function isCarAvailableForTimeSlot(car, pickupDateTime, dropoffDateTime) {
  const bookings = car.bookings || [];
  const pickupTime = new Date(pickupDateTime);
  const dropoffTime = new Date(dropoffDateTime);

  for (const booking of bookings) {
    const bookingPickupTime = new Date(booking.pickupDateTime);
    const bookingDropoffTime = new Date(booking.dropoffDateTime);

    if (
      (pickupTime >= bookingPickupTime && pickupTime < bookingDropoffTime) ||
      (dropoffTime > bookingPickupTime && dropoffTime <= bookingDropoffTime) ||
      (pickupTime <= bookingPickupTime && dropoffTime >= bookingDropoffTime)
    ) {
      return false; 
    }
  }

  return true; 
}

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
