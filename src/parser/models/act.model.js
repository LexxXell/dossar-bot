const mongoose = require("mongoose");

module.exports = mongoose.model("Act", mongoose.Schema(
  {
    year: Number(),
    link: String(),
    filePath: String(),
  },
));