require('dotenv').config();
require('./db');

const { Telegraf } = require('telegraf');
const BotSettings = require('./models/botSettings.model');

let botSettings;
const useOnlyEnvToken = /true/i.test(process.env.BOT_USE_ONLY_ENV_TOKEN);

const getBotSettings = async () => {
  if (useOnlyEnvToken) {
    botSettings = { token: process.env.BOT_TOKEN };
  } else {
    await BotSettings.findOne().then(async (settings) => {
      botSettings = settings;
      if (!botSettings || !botSettings.token) {
        if (!botSettings) {
          await BotSettings.create({ token: process.env.BOT_TOKEN }).then(() => {
            botSettings = { token: process.env.BOT_TOKEN };
          });
        } else {
          await BotSettings.updateOne({}, { token: process.env.BOT_TOKEN }).then(() => {
            botSettings = { token: process.env.BOT_TOKEN };
          });
        }
      }
    });
  }

  return botSettings;
};

getBotSettings().then((botSettings) => {
  const bot = new Telegraf(botSettings.token);

  bot.hears(/.+/, (ctx) => (ctx.status = 200));

  bot.launch();
});
