const express = require("express");
const cors = require("cors");
const app = express();
const mongoose = require("mongoose");
const User = require("./models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const saltRounds = 10;
const crypto = require("crypto");
const secret = process.env.JWT_SECRET || "3e259aaa6f2a67e28ae271042e7a055c"; // Use environment variable for secret
const multer = require("multer");
const storage = multer.memoryStorage();
const uploadMiddleware = multer({ storage: storage });
const Post = require("./models/Post");
const fs = require("fs");
const dotenv = require("dotenv");
const maxDuration = 60;
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
dotenv.config();
const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;
const accessKey = process.env.ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;
const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});

mongoose
  .connect(process.env.MONGODB)
  .then(() => {
    console.log("connected to mongodb");
  })
  .catch((error) => {
    console.log(error);
  });

const corsOptions = {
  origin: "https://blogs.hrsvrn.me", // the client domain
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static(__dirname + "/uploads"));
const port = 4000;

app.listen(port, () => {
  console.log(`server running on port ${port}`);
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = bcrypt.hashSync(password, saltRounds);
    const userDoc = await User.create({
      username: username,
      password: hashedPassword,
    });
    res.json(userDoc);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const userDoc = await User.findOne({ username });
    if (!userDoc) {
      return res.status(400).json({ error: "wrong credentials" });
    }
    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
      // logged in
      jwt.sign({ username, id: userDoc._id }, secret, { expiresIn: '10d' }, (err, token) => {
        if (err) throw err;
        res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'Strict', maxAge: 10 * 24 * 60 * 60 * 1000 }).json({
          id: userDoc._id,
          username,
        });
      });
    } else {
      res.status(400).json({ error: "wrong credentials" });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/profile", (req, res) => {
  const { token } = req.cookies;
  jwt.verify(token, secret, {}, (err, info) => {
    if (err) {
      console.log(err);
      return res.status(400).json({ error: "Invalid token" });
    }
    res.json(info); // Return user info if token is valid
  });
});

app.post("/logout", (req, res) => {
  res.cookie("token", "", { httpOnly: true, secure: true, sameSite: 'Strict', maxAge: 0 }).json("ok");
});

app.post("/post", uploadMiddleware.single("file"), async (req, res) => {
  const { originalname, buffer, mimetype } = req.file;
  const parts = originalname.split(".");
  const randomImageName = `${Date.now()}-${originalname}`;
  req.file.randomImageName = randomImageName;

  const params = {
    Bucket: bucketName,
    Key: req.file.randomImageName,
    Body: buffer,
    ContentType: mimetype,
  };

  const command = new PutObjectCommand(params);
  let imageURL;

  try {
    await s3.send(command);

    // Generate a public URL
    imageURL = `https://${bucketName}.s3.${process.env.BUCKET_REGION}.amazonaws.com/${req.file.randomImageName}`;
  } catch (err) {
    console.error(err); // Use console.error for error logging
    return res.status(500).json({ error: "Error uploading image to S3" });
  }

  const { token } = req.cookies;

  jwt.verify(token, secret, async (err, info) => {
    if (err) {
      console.error(err); // Log the error for easier debugging
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { title, summary, content } = req.body;
    try {
      const postDoc = await Post.create({
        title,
        summary,
        content,
        imageURL,
        author: info.id,
      });

      res.status(201).json(postDoc); // Status 201 for successful resource creation
    } catch (err) {
      console.error(err); // Log the error
      res.status(500).json({ error: "Error creating post" });
    }
  });
});

app.get("/post", async (req, res) => {
  res.json(
    await Post.find()
      .populate("author", ["username"])
      .sort({ createdAt: -1 })
      .limit(20)
  );
});

app.get("/post/:id", async (req, res) => {
  const { id } = req.params;
  const postDoc = await Post.findById(id).populate("author", ["username"]);
  res.json(postDoc);
});