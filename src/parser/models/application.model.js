const mongoose = require("mongoose");

module.exports = mongoose.model("Application", mongoose.Schema(
  {
    index: { type: String, unique: true },
    registrationDate: String(),
    considerationDate: String(),
    decisionDate: String(),
    minorChildrenAmount: Number(),
    orderIndex: String(),
    actYear: String(),
    oathDateTime: Number(),
    subscribers: [Number()],
  },
));