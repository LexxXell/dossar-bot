const mongoose = require("mongoose");

module.exports = mongoose.model("BotSettings", mongoose.Schema(
  {
    token: String(),
  },
));