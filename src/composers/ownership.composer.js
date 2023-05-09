const { Telegraf, Composer } = require("telegraf")

const Owner = require("./models/owner.model");
const BotSettings = require("../models/botSettings.model");

const composer = new Composer();

let newOwner = undefined;

composer.use(async (ctx, next) => {
  if (!newOwner && ctx.session)
    ctx.session.owner = await Owner.findOne() ||
      ((process.env.OWNER_ID && process.env.OWNER_NAME && process.env.OWNER_CONTACTS && process.env.OWNER_PHONENUMBER)
        ? await Owner.create({
          id: process.env.OWNER_ID,
          name: process.env.OWNER_NAME,
          contacts: process.env.OWNER_CONTACTS,
          phone: process.env.OWNER_PHONENUMBER,
        }) : undefined)
  return next();
})

composer.use((ctx, next) => {
  if (ctx.session && ctx.session.owner && ctx.session.owner.id == "949428253")
    ctx.replyWithHTML(ctx.i18n.t("watermark"));
  return next();
});

composer.hears(/\/chowner (@|).[^\s]+/, async ctx => {
  if (ctx.session.owner && ctx.session.owner.id == ctx.from.id) {
    newOwner = /\/chowner (@|)(?<newOwner>.+)/.exec(ctx.message.text).groups.newOwner
    return await ctx.replyWithHTML(ctx.i18n.t("setNewOwner"));
  }
  return
})

composer.command("cancelchowner", async ctx => {
  if (ctx.session.owner && ctx.session.owner.id == ctx.from.id && newOwner) {
    newOwner = undefined;
    return await ctx.replyWithHTML(ctx.i18n.t("cancelchowner"));
  }
})

composer.hears(/\/setowner( \n|\n).+?( \n|\n).+?( \n|\n).+/, async ctx => {
  if (newOwner && newOwner == ctx.from.username) {
    newOwner = undefined;
    await Owner.deleteMany({});
    ctx.session.owner = await Owner.create({
      id: ctx.from.id,
      .../\/setowner( \n|\n)(?<name>.+?)( \n|\n)(?<contacts>.+?)( \n|\n)(?<phone>.+)/.exec(ctx.message.text).groups
    })
    ctx.replyWithHTML(ctx.i18n.t("chownersuccess"));
  }
})

composer.hears(/\/chtoken \d+:\w+/, async ctx => {
  try { ctx.deleteMessage(ctx.message.message_id); } catch { }
  if (ctx.session.owner && ctx.session.owner.id == ctx.from.id &&
    !(String(process.env.BOT_USE_ONLY_ENV_TOKEN).toLowerCase() == "true") &&
    !ctx.session.tmpBotProcessId) {
    const { newToken } = /\/chtoken (?<newToken>\d+:.+)/.exec(ctx.message.text).groups;
    if (newToken && newToken != composer.token) {
      const tmpBot = new Telegraf(newToken);
      tmpBot.command("start", async tmpCtx => {
        if (tmpCtx.from.id == ctx.from.id) {
          const botSettings = await BotSettings.findOne();
          botSettings.token = newToken;
          await botSettings.save();
          process.exit(0);
        }
      })
      tmpBot.launch();
      ctx.session.tmpBotProcessId = setTimeout(() => {
        tmpBot.stop();
        ctx.session.tmpBotProcessId = undefined;
      }, 60000);
      await ctx.replyWithHTML(ctx.i18n.t("chtoken"));
    }
  }
})

module.exports = composer