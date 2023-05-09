const { Composer } = require("telegraf")

const composer = new Composer();

composer.hears(/^\/start$|^\/help$/, async ctx => {
    await ctx.replyWithHTML(ctx.i18n.t("help"));
    if (ctx.session.owner.id == ctx.from.id)
      return await ctx.replyWithHTML(ctx.i18n.t("help_owner"));
  })

module.exports = composer