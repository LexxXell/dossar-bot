const mongoose = require("mongoose");

module.exports = mongoose.model("Order", mongoose.Schema(
  {
    index: { type: String, unique: true },
    name: String(),
    date: String(),
    year: String(),
    link: String(),
    filePath: String(),
    processed: { type: Boolean, default: false },
  },
));