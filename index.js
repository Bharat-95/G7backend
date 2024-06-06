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
require('dotenv').config()

const upload = multer({
  storage: multer.memoryStorage()
});
AWS.config.update({ region: 'us-east-1' });
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const tableName = 'G7Cars';
const s3 = new AWS.S3();
app.use(cors());
app.use(express.json());

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function sendWhatsAppMessage(to, body) {
  try {
    await twilioClient.messages.create({
      from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
      to: 'whatsapp:' + to,
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
    const item = {
      G7cars123: uuidv4(),
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
        item[field] = imageUrls;
      }
    }

    const params = {
      TableName: tableName,
      Item: item,
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
      const createBookingParams = {
        TableName: 'Bookings',
        Item: {
          G7cars123: orderId,
          carId,
          bookingId,
          pickupDateTime,
          dropoffDateTime,
          createdAt: new Date().toISOString(),
          status: 'confirmed',
          paymentId: paymentId
        },
      };
      await dynamoDb.put(createBookingParams).promise();
      const updateCarParams = {
        TableName: 'G7Cars',
        Key: {
          G7cars123: carId,
        },
        UpdateExpression: 'set #availability = :availability',
        ExpressionAttributeNames: {
          '#availability': 'Availability'
        },
        ExpressionAttributeValues: {
          ':availability': 'Booked'
        },
        ReturnValues: 'ALL_NEW'
      };
      await dynamoDb.update(updateCarParams).promise();
      const messageBody = `Booking confirmed! \nBooking ID: ${bookingId}\nCar ID: ${carId}\nPickup DateTime: ${pickupDateTime}\nDropoff DateTime: ${dropoffDateTime}`;


      await sendWhatsAppMessage(userPhoneNumber, messageBody);
      console.log(userPhoneNumber)
      await sendWhatsAppMessage('whatsapp:+917993291554', messageBody);

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
    const params = {
      TableName: tableName,
    };
    const data = await dynamoDb.scan(params).promise();
    res.json(data.Items);
  } catch (error) {
    console.error('Error fetching data from DynamoDB:', error);
    res.status(500).send('Unable to fetch data from DynamoDB');
  }
});

app.put('/cars/:carNo', async (req, res) => {
  const carNo = req.params.carNo;

  try {
    const params = {
      TableName: tableName,
      Key: {
        carNo: carNo
      },
      UpdateExpression: 'set #attr1 = :val1',
      ExpressionAttributeNames: {
        '#attr1': 'exampleAttribute'
      },
      ExpressionAttributeValues: {
        ':val1': req.body.exampleAttribute
      },
      ReturnValues: 'ALL_NEW'
    };

    const data = await dynamoDb.update(params).promise();
    res.status(200).json(data.Attributes);
  } catch (error) {
    console.error('Error updating car data:', error);
    res.status(500).send('Unable to update car data');
  }
});

app.delete('/cars/:carNo', async (req, res) => {
  const carNo = req.params.carNo;

  const params = {
    TableName: tableName,
    Key: {
      G7cars123: carNo
    },
    ConditionExpression: 'attribute_exists(G7cars123)'
  };

  try {
    const carDetails = await dynamoDb.get(params).promise();
    const carData = carDetails.Item;

    const imageUrls = [];
    for (const key in carData) {
      if (key.endsWith('Back') || key.endsWith('Front') || key === 'Coverimage' || key === 'Insurance' || key === 'AdhaarBack' || key === 'AdhaarFront' || key === 'RcBack' || key === 'RcFront') {
        const imageAttribute = carData[key];
        if (imageAttribute && imageAttribute.L && imageAttribute.L.length > 0) {
          imageAttribute.L.forEach(image => {
            imageUrls.push(image.S);
          });
        }
      }
    }

    await dynamoDb.delete(params).promise();

    await Promise.all(imageUrls.map(async (imageUrl) => {
      const imageKey = getImageKeyFromUrl(imageUrl);
      await s3.deleteObject({ Bucket: 'g7cars', Key: imageKey }).promise();
    }));

    res.status(200).send('Car deleted successfully');
  } catch (error) {
    console.error('Error deleting car data:', error.message, 'Details:', error);
    if (error.code === 'ConditionalCheckFailedException') {
      res.status(404).send('Car not found');
    } else {
      res.status(500).send('Unable to delete car data');
    }
  }
});

function getImageKeyFromUrl(imageUrl) {
  const parts = imageUrl.split('/');
  return parts[parts.length - 1];
}


async function updateCarAvailability() {
  try {
    const now = new Date().toISOString();

    const bookingParams = {
      TableName: 'Bookings',
      FilterExpression: 'dropoffDateTime <= :now AND #status = :status',
      ExpressionAttributeValues: {
        ':now': now,
        ':status': 'confirmed'
      },
      ExpressionAttributeNames: {
        '#status': 'status'
      }
    };
    const bookingsData = await dynamoDb.scan(bookingParams).promise();


    for (const booking of bookingsData.Items) {
      const updateCarParams = {
        TableName: 'G7Cars',
        Key: {
          G7cars123: booking.carId,
        },
        UpdateExpression: 'set #availability = :availability',
        ExpressionAttributeNames: {
          '#availability': 'Availability'
        },
        ExpressionAttributeValues: {
          ':availability': 'Available'
        },
        ReturnValues: 'ALL_NEW'
      };
      await dynamoDb.update(updateCarParams).promise();
    }

    console.log('Car availability updated successfully');
  } catch (error) {
    console.error('Error updating car availability:', error);
  }
}
cron.schedule('0 * * * *', () => {
  console.log('Running scheduled task to update car availability');
  updateCarAvailability();
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
