const express = require('express');
const app = express();
const port = process.env.PORT || 4000;
const AWS = require('aws-sdk');
const cors = require('cors');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { v4: uuidv4 } = require('uuid');

AWS.config.update({ region: 'us-east-1' });

const s3 = new AWS.S3();
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const tableName = 'G7Cars';

app.use(cors());
app.use(express.json());

const storage = multerS3({
  s3: s3,
  bucket: 'g7backend',
  acl: 'public-read',  // Add ACL to make the files publicly readable
  metadata: (req, file, cb) => {
    cb(null, { fieldName: file.fieldname });
  },
  key: (req, file, cb) => {
    cb(null, `${uuidv4()}_${file.originalname}`);
  },
  contentType: multerS3.AUTO_CONTENT_TYPE // Set content type automatically
});

const upload = multer({ storage: storage });

app.get('/cars', async (req, res) => {
  try {
    const params = {
      TableName: tableName,
    };

    const data = await dynamoDb.scan(params).promise();
    res.json(data.Items);
  } catch (error) {
    console.error('Unable to fetch data', error);
    res.status(500).send('Unable to fetch data from DynamoDB');
  }
});

app.delete('/cars/:id', async (req, res) => {
  try {
    const params = {
      TableName: tableName,
      Key: {
        id: req.params.id,
      },
    };

    await dynamoDb.delete(params).promise();
    res.json({ message: 'Data deleted from DynamoDB' });
  } catch (error) {
    console.error('Error deleting product', error);
    res.status(500).send('Unable to delete data from DynamoDB');
  }
});

app.post('/cars', upload.fields([
  { name: 'Coverimage', maxCount: 1 },
  { name: 'RcFront', maxCount: 1 },
  { name: 'RcBack', maxCount: 1 },
  { name: 'AdhaarFront', maxCount: 1 },
  { name: 'AdhaarBack', maxCount: 1 },
  { name: 'Insurance', maxCount: 1 },
  { name: 'Pollution', maxCount: 1 },
  { name: 'Images', maxCount: 30 },
  { name: 'AgreementDoc', maxCount: 1 }
]), async (req, res) => {
  try {
    const item = {
      id: uuidv4(),
      ...req.body
    };

    const files = req.files;
    for (const fieldName of Object.keys(files)) {
      item[fieldName] = files[fieldName].map(file => file.location);
    }

    const params = {
      TableName: tableName,
      Item: item,
    };

    await dynamoDb.put(params).promise();
    res.status(200).send('Uploaded data successfully');
  } catch (error) {
    console.error('Unable to post details', error);
    res.status(500).send('Unable to post details to DynamoDB');
  }
});

app.put('/cars/:id', async (req, res) => {
  try {
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    for (const [key, value] of Object.entries(req.body)) {
      updateExpressions.push(`#${key} = :${key}`);
      expressionAttributeNames[`#${key}`] = key;
      expressionAttributeValues[`:${key}`] = value;
    }

    const params = {
      TableName: tableName,
      Key: {
        id: req.params.id,
      },
      UpdateExpression: `set ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'UPDATED_NEW'
    };

    const result = await dynamoDb.update(params).promise();

    if (result.Attributes) {
      res.status(200).send('Car details updated successfully');
    } else {
      res.status(404).send('Car not found or no changes made');
    }
  } catch (error) {
    console.error('Unable to update car details', error);
    res.status(500).send('Unable to update car details in DynamoDB');
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
