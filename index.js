const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');

require('dotenv').config();
const port = process.env.PORT || 5000;

const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)


// middleware
app.use(cors());
app.use(express.json());

/**--------------Validate jwt token----------**/ 
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
    .status(401)
    .send({ error: true, message: 'Unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      res.status(401).send({ error: true, message: 'Unauthorized access' });
    }
    req.decoded = decoded;
    next();
  })
}


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qupsx4j.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();



    const danceCollection = client.db("danceWaveDB").collection("danceClasses");
    const usersCollection = client.db("danceWaveDB").collection("users");
    const selectedClassCollection = client.db("danceWaveDB").collection("selectedClass");
    const pendingClassCollection = client.db("danceWaveDB").collection("pendingClass");
    const paymentCollection = client.db('bistroDB').collection('payments');

    // jwt token api
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1hr' })

      res.send({ token })
    });

      // ---- verify admin----
      const verifyAdmin = async (req, res, next) => {
        const email = req.decoded.email;
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        if (user?.role !== 'admin') {
            return res.status(403).send({
                error: true,
                message: 'Forbidden message'
            })
        }
        next();
    };


    // API's for users
    app.get('/users', async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    })
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists' })
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })

    app.get('/users/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false })
      }
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result);
    });

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin',
        },
      };

      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // app.patch('/users/instructor/:email', async (req, res) => {
    //   const email = req.params.email;
    //   const query = { email: email };
    //   const updateDoc = {
    //     $set: {
    //       role: 'instructor', 
    //     },
    //   };

    //   const result = await usersCollection.updateOne(query, updateDoc);
    //   res.send(result);
    //   console.log(result);
    // });

    app.patch('/users/instructor/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'instructor',
        },
      };

      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });



    // API for all classes
    app.get('/danceclasses', async (req, res) => {
      const result = await danceCollection.find().toArray();
      res.send(result);
    });

    // app.post('/danceclasses', async (req, res) => {
    //   const newClass = req.body;
    //   const query = { name: newClass.name, instructorName: newClass.instructorName }
    //   const existingClass = await pendingClassCollection.findOne(query);
    //   if (existingClass) {
    //     return res.send({ message: 'Class already exists' })
    //   }
    //   const result = await danceCollection.insertOne(newClass);
    //   res.send(result);
    //   console.log(newClass, result);
    // })
    app.put('/danceclasses', async (req, res) => {
      const newClass = req.body
      const filter = { name: newClass.name }
      const options = { upsert: true }
      const updateDoc = {
        $set: {
          name: newClass.name,
          category: newClass.category,
          instructorName: newClass.instructorName,
          availableSeats: newClass.availableSeats,
          fee: newClass.fee,
          details: newClass.details,
          image: newClass.image,
          status: 'approved',
          instructorEmail: newClass.instructorEmail,
          enrolledCount: newClass.enrolledCount,
          students: []
        },
      }
      const result = await danceCollection.updateOne(filter, updateDoc, options)
      res.send(result);
      console.log(newClass, filter, options);
    })


    // selected class api
    app.get('/selectedclass',verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded?.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'Forbidden access' })
      }
      const query = { email: email };
      const result = await selectedClassCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/selectedclass', async (req, res) => {
      const item = req.body;
      const query = { email: item.email }
      const existingUser = await selectedClassCollection.find(query).toArray();
      if (existingUser) {
        const query = { name: item.name }
        // const existingClass = await existingUser.findOne(query);
        const existing = existingUser.find(k => k.name === item.name);
        if (existing) {
          return res.send({ message: 'Class already selected' })
        }
        else {
          const result = await selectedClassCollection.insertOne(item);
          res.send(result);
        }
        // console.log(query, existingClass);
      }
      else {
        const result = await selectedClassCollection.insertOne(item);
        res.send(result);
      }
      console.log(item);
      // const result = await selectedClassCollection.insertOne(item);
      // res.send(result);
      // console.log(query, existingUser);
    })
    app.delete('/selectedclass/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedClassCollection.deleteOne(query);
      res.send(result);
    });


    // API's for pending classes
    app.get('/dashboard/pendingclasses', async (req, res) => {
      const result = await pendingClassCollection.find().toArray();
      res.send(result);
    })
    // Pending classes for specific instructor
    app.get('/pendingclasses/:email', async (req, res) => {
      const email = req.params.email;
      const query = { instructorEmail: email }
      const myPendingClass = await pendingClassCollection.find(query).toArray();
      res.send(myPendingClass);
    });
    // Post pending classes for specific instructor
    app.post('/pendingclasses', async (req, res) => {
      const newClass = req.body;
      // console.log(newClass);
      const query = { name: newClass.name, instructorName: newClass.instructorName }
      const existingClass = await pendingClassCollection.findOne(query);
      if (existingClass) {
        return res.send({ message: 'Class already exists' })
      }
      const result = await pendingClassCollection.insertOne(newClass);
      res.send(result);
    })

    // Approve pending class status by administrative
    app.patch('/dashboard/approvedclasses/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: 'approved',
        },
      };
      const result = await pendingClassCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    // Deny pending class status by administrative
    app.patch('/dashboard/deniedclasses/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: 'denied',
        },
      };
      const result = await pendingClassCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Create Payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { items } = req.body;
      const amount = parseInt(items * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        currency: 'usd',
        amount: amount,
        payment_method_types: ['card']
      })

      res.send({
        clientSecret: paymentIntent.client_secret,
      })
    })

    //  payment intent related api
     app.patch('/selectedclasses', async (req, res) => {
      const paidClass = req.body;
      const query = { name: paidClass.enrolledClass , instructorEmail: paidClass.instructorEmail
      };
      const updateDoc = {
        $set: {
          status: 'paid',
          transactionId: paidClass.transactionId
        },
      };
      const result = await selectedClassCollection.updateOne(query, updateDoc);
      res.send(result);
      // console.log(query, result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Welcome to DanceWave!');
});
app.listen(port, () => {
  console.log(`Welcome to DanceWave on port ${port}`);
})
