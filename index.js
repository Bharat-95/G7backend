const express = require('express')
const app = express()
const port = process.env.PORT || 4000
const {MongoClient, ObjectId} = require('mongodb')
const AWS = require('aws-sdk');
const cors = require('cors')
const multer = require('multer')

const s3 = new AWS.S3({
  region: 'us-east-1',
});

const url = 'mongodb+srv://g7selfdrivecars:G7cars123@cluster0.77lf8cj.mongodb.net/G7Cars?retryWrites=true&w=majority';

let client;

app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();

const upload = multer({ storage: storage });

async function run() {

  try {

    await client.connect();

    

    app.get('/', (req, res) => {
      res.send('Hello World!')
    })

     app.get('/cars', async (req, res) => {
    try {
    const db = client.db('G7Cars')
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
    const db = client.db('G7Cars')
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
    const db = client.db('Lingeshwara');
    const collection = db.collection('Cars');

    const insert = req.body;

    const promises = [];
    for (const fieldName of Object.keys(req.files)) {
      const file = req.files[fieldName][0];
      const params = {
        Bucket: 'g7backend',
        Key: `${fieldName}/${file.originalname}`,
        Body: file.buffer,
      };
      promises.push(s3.upload(params).promise());
    }

    await Promise.all(promises);

    await collection.insertOne(insert);

    res.status(200).send('Uploaded data successfully');
  } catch (error) {
    console.error('Unable to post details', error);
    res.status(500).send('Unable to post details to MongoDB');
  }
});

app.put('/cars/:id', async (req, res) => {
  try {
    const db = client.db('Lingeshwara');
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

}
    
)







app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

} catch (error) {

console.error('unable to connect', error);

}
}

app.listen(port);
run();
