const express = require('express');
const app = express();
const port = process.env.PORT || 4000;
const AWS = require('aws-sdk');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage()
});

AWS.config.update({ region: 'us-east-1' });

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const tableName = 'G7Cars';
const s3 = new AWS.S3();

app.use(cors());
app.use(express.json());

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
      id: uuidv4(),
      ...req.body
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

app.get('/cars/:id', async (req, res) => {
  try {
    const params = {
      TableName: tableName,
      Key: {
        id: req.params.id
      }
    };
    const data = await dynamoDb.get(params).promise();
    if (!data.Item) {
      res.status(404).send('Car not found');
      return;
    }

    const coverImageUrl = data.Item.coverImageUrl;
    if (!coverImageUrl) {
      res.status(404).send('Cover image not found');
      return;
    }

    const responseData = {
      ...data.Item,
      coverImageUrl: coverImageUrl
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error retrieving car data:', error);
    res.status(500).send('Unable to retrieve car data');
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
