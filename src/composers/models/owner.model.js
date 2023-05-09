const mongoose = require("mongoose");

module.exports = mongoose.model("Owner", mongoose.Schema(
  {
    id: String(),
    name: String(),
    contacts: String(),
    phone: String(),
  },
));