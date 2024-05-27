const { MongoClient, ObjectId } = require('mongodb');
const express = require('express');
const serverless = require('serverless-http');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cors = require('cors'); 
const jwt = require('jsonwebtoken');

const app = express();

const url = 'mongodb+srv://g7selfdrivecars:G7cars123@cluster0.77lf8cj.mongodb.net/G7Cars?retryWrites=true&w=majority';

let client;

app.use(cors());

app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

async function connectToMongoDB() {
  if (!client) {
    client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    console.log('Connected to MongoDB');
  }
  return client.db('G7Cars');
}

app.get('/', (req, res) => {
  res.send('Backend server');
});

app.get('/cars', async (req, res) => {
  try {
    const db = await connectToMongoDB();
    const collection = db.collection('Cars');
    const data = await collection.find({}).toArray();
    res.json(data);
  } catch (error) {
    console.error('Unable to fetch data', error);
    res.status(500).send('Unable to fetch data from MongoDB');
  }
});

app.delete('/cars/:id', async (req, res) => {
  try {
    const db = await connectToMongoDB();
    const collection = db.collection('Cars');
    const id = req.params.id;
    await collection.deleteOne({ _id: new ObjectId(id) });
    res.json({ message: 'Data deleted from MongoDB' });
  } catch (error) {
    console.error('Error deleting product', error);
    res.status(500).send('Unable to delete data from MongoDB');
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
    const db = await connectToMongoDB();
    const collection = db.collection('Cars');

    const insert = req.body;

    insert.Coverimage = req.files?.['Coverimage']?.[0]?.buffer;
    insert.RcFront = req.files?.['RcFront']?.[0]?.buffer;
    insert.RcBack = req.files?.['RcBack']?.[0]?.buffer;
    insert.AdhaarFront = req.files?.['AdhaarFront']?.[0]?.buffer;
    insert.AdhaarBack = req.files?.['AdhaarBack']?.[0]?.buffer;
    insert.Insurance = req.files?.['Insurance']?.[0]?.buffer;
    insert.Pollution = req.files?.['Pollution']?.[0]?.buffer;
    insert.Images = req.files?.['Images']?.[0]?.buffer;
    insert.AgreementDoc = req.files?.['AgreementDoc']?.[0]?.buffer;

    await collection.insertOne(insert);

    res.status(200).send('Uploaded data successfully');
  } catch (error) {
    console.error('Unable to post details', error);
    res.status(500).send('Unable to post details to MongoDB');
  }
});

app.put('/cars/:id', async (req, res) => {
  try {
    const db = await connectToMongoDB();
    const collection = db.collection('Cars');
    const id = req.params.id;
    const updateData = req.body;

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.modifiedCount === 1) {
      res.status(200).send('Car details updated successfully');
    } else {
      res.status(404).send('Car not found or no changes made');
    }
  } catch (error) {
    console.error('Unable to update car details', error);
    res.status(500).send('Unable to update car details in MongoDB');
  }
});

module.exports.handler = serverless(app);
