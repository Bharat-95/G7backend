const express = require('express');
const { v4: uuidv4 } = require('uuid');
const app = express();

app.use(express.json());

module.exports = {
  async handleRequest(event, collectionName) {
    switch (event.httpMethod) {
      case 'GET':
        return await this.handleGetRequest(collectionName);
      case 'POST':
        return await this.handlePostRequest(JSON.parse(event.body), collectionName);
      case 'DELETE':
        return await this.handleDeleteRequest(event.pathParameters.id, collectionName);
      case 'PUT':
        return await this.handlePutRequest(event.pathParameters.id, JSON.parse(event.body), collectionName);
      default:
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
  },

  async handleGetRequest(collectionName) {
    try {
      const snapshot = await db.collection(collectionName).get();
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return { statusCode: 200, body: JSON.stringify(data) };
    } catch (error) {
      console.error('Unable to fetch data from Firestore:', error);
      return { statusCode: 500, body: 'Internal Server Error' };
    }
  },

  async handlePostRequest(data, collectionName) {
    try {
      await db.collection(collectionName).add(data);
      return { statusCode: 201, body: 'Data inserted successfully' };
    } catch (error) {
      console.error('Unable to insert data into Firestore:', error);
      return { statusCode: 500, body: 'Internal Server Error' };
    }
  },

  async handleDeleteRequest(id, collectionName) {
    try {
      await db.collection(collectionName).doc(id).delete();
      return { statusCode: 200, body: 'Data deleted successfully' };
    } catch (error) {
      console.error('Unable to delete data from Firestore:', error);
      return { statusCode: 500, body: 'Internal Server Error' };
    }
  },

  async handlePutRequest(id, data, collectionName) {
    try {
      await db.collection(collectionName).doc(id).update(data);
      return { statusCode: 200, body: 'Data updated successfully' };
    } catch (error) {
      console.error('Unable to update data in Firestore:', error);
      return { statusCode: 500, body: 'Internal Server Error' };
    }
  },
}
