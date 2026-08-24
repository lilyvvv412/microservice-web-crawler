const mongoose = require('mongoose');

const UrlSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    domain: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    priority: {
      type: Number,
      default: 0,
      index: true,
    },
    depth: {
      type: Number,
      default: 0,
    },
    parentUrl: {
      type: String,
      default: null,
    },
    failureReason: String,
    retryCount: {
      type: Number,
      default: 0,
    },
    lastAttempt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Url', UrlSchema);
