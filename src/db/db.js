const mongoose = require("mongoose");
mongoose.Promise = require("bluebird");

mongoose.connect(process.env.MONGO_URL ? process.env.MONGO_URL : "mongodb://localhost:27017");

mongoose.connection

mongoose.connection.on("error", err => {
  console.error("[ERROR] MONGODB ", err)
})

mongoose.connection.once("open", async () => {
  console.log("[INFO] MONGODB connected");
})

module.exports = mongoose;