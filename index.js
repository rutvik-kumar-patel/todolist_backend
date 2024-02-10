const express = require('express')
var cors = require('cors')
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// const User = require('./models/User');
// const Notes = require('./models/Notes')
const { body, validationResult } = require('express-validator')
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
require('dotenv').config();
const { Schema } = mongoose;

const jwt_SECRET = process.env.JWT_SECRET

const Userschema = new Schema({
  firstName:{type:String , require: true},
  lastName:{type:String , require: true},
  email:{type:String , require: true, unique: true},
  password:{type:String, require:true},
  date:{type:Date, default:Date.now},
 
});
const User = mongoose.model('user', Userschema);

const Noteschema = new Schema({
  user:{type:String, require:true},
  title:{type:String , require: true},
  description:{type:String , require: true},
  isCompleted:{type:Boolean, require:true},
},
{
  timestamps:true
}
);

const Notes = mongoose.model('Note',Noteschema);

const connectToMongo = () => {
  mongoose.connect(process.env.MONGODB_URI).then((result)=>{
    console.log("DB Connected Successfully!");
}).catch(err=>{
    console.log(err);
})
}
connectToMongo();

const app = express()
const port = process.env.PORT;

app.use(bodyParser.json());
app.use(cors())


app.use(express.json()) 

const fetchuser = (req, res, next)=>{
    
  const token = req.header('auth-token')  
  if(!token){
      res.status(401).send({ error: "Please authenticater using a valid token 1" })
  }
  try {
      const data = jwt.verify(token, jwt_SECRET)
      
      req.user = data.user
      next()
  } catch (error) {
      res.status(401).send({ error: "Please authenticater using a valid token" })

  }
}

app.get('/', async (req, res) => {
  res.status(200).json({"status": "up"})
})

// Available Routes for user
app.post('/api/auth/createuser', [
  body('email', 'Enter a valid email').isEmail(),
  body('password', 'Password must be atleast 5 characters').isLength({ min: 5 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({  errors: errors.array() });
  }
  try {
    let user = await User.findOne({ email: req.body.email }) // if any email match in database so i get error
    if (user) {
      return res.status(400).json({ "errors": [{ "msg": "Sorry a user with this email already exists"} ]})
    }
    // Sorry a user with this email already exists
    const salt = await bcrypt.genSalt(10)
    const secPass = await bcrypt.hash(req.body.password, salt);

    user = await User.create({
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      password: secPass,
      email: req.body.email,
    });

    const data = {
      user: {
        id: user.id,
        email: user.email
      }
    }
    const authtoken = jwt.sign(data, jwt_SECRET);
    res.json({ authtoken })

  } catch (error) {
    console.log(error)
    res.status(500).send("Internal server  error");
  }

})

app.post('/api/auth/login',[
  body('email', 'Enter a valid email').isEmail(),
  body('password', 'Password cannot be blank').exists(),
],async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { email, password } = req.body
  try {
    let user = await User.findOne({ email })
    if (!user) {
      return res.status(404).json({ error: "please try to login with correct credentials" })
    }

    const passwordCompare = await bcrypt.compare(password, user.password)

    if (!passwordCompare) {
      return res.status(404).json({ error: "please try to login with correct credentials" })
    }
    const data = {
      user: {
        id: user.id,
        email: user.email
      }
    }
    const authtoken = jwt.sign(data, jwt_SECRET)
    res.json({authtoken, success:true })

  } catch (error) {
    console.log(error)
    res.status(500).send("Internal server  error");
  }

})

app.post('/api/auth/getuser', fetchuser, async (req, res)=>{
  try {
    const userEmail = req.user.email
    const user = await User.find({userEmail})
    res.send(user)
    
  } catch (error) {
    console.log(error)
    res.status(500).send("Internal server  error");
  }
})

// Available for notes
app.get('/api/notes/fetchallnotes', fetchuser, async (req, res) => {
  try {
      const notes = await Notes.find({ user: req.user.email })
      res.json(notes)
  } catch (error) {
      res.ststus(500).send("Some error occured");
  }
})

app.post('/api/notes/addnote', fetchuser,[
  body('title', 'Enter a valid title').isLength({ min: 3 }),
  body('description','Enter valid email').isLength({min: 3}),
  ],  async (req, res) => {
  try {
      
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
      }
      const { title, description, isCompleted } = req.body
      const note = new Notes({ user: req.user.email, title, description, isCompleted })
      const savedNote = await note.save()
      res.json(savedNote)
  } catch (error) {
      res.status(500).send("Some error occured");
  }
})

app.put('/api/notes/updatenote/:id', fetchuser, async (req, res) => {
  const { title, description, isCompleted } = req.body
  try {
      const newNote = {};
      if (title) { newNote.title = title }
      if (description) { newNote.description = description }
      if (isCompleted) { newNote.isCompleted = isCompleted }
      if (!isCompleted) { newNote.isCompleted = isCompleted }

      let note = await Notes.findById(req.params.id)
      if (!note) {
          return res.status(404).send("Not found")
      }
      if (note.user.toString() !== req.user.email) {
          return res.status(401).send("Not Allowed")
      }
      note = await Notes.findByIdAndUpdate(req.params.id, { $set: newNote }, { new: true })
      res.json({ note })
  } catch (error) {
    console.log(error)
      res.status(500).send("Internal server  error");
  }
})
app.delete('/api/notes/deletenote/:id', fetchuser, async (req, res) => {
  try {
      let note = await Notes.findById(req.params.id)
      if (!note) {
          return res.status(404).send("Not found")
      }
      if (note.user.toString() !== req.user.email) {
          return res.status(401).send("Not Allowed")
      }

      note = await Notes.findByIdAndDelete(req.params.id)
      res.json({ note })
  } catch (error) {
      res.status(500).send("Internal server  error");
  }

})

app.listen(port, () => {
  console.log(`iNotebook backend listening at http://localhost:${port}`)
})
