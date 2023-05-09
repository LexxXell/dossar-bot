const mongoose = require("mongoose");

module.exports = mongoose.model("Oath", mongoose.Schema(
  {
    dateTime: Number(),
    link: String(),
    filePath: String(),
  },
));