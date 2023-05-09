const { Composer } = require("telegraf")

const Application = require("../parser/models/application.model");

const composer = new Composer();

composer.command("unsub", async ctx => {
  try {
    for (const application of await Application.find({ subscribers: { $ne: [] } })) {
      if (application.subscribers.indexOf(ctx.from.id) + 1) {
        application.subscribers.splice(
          application.subscribers.indexOf(ctx.from.id),
          1
        )
        await application.save();
      }
    }
    return await ctx.replyWithHTML(ctx.i18n.t("unsubscribeSuccess"));
  } catch (e) {
    console.log(e);
    return await ctx.replyWithHTML(ctx.i18n.t("error"));
  }
})

composer.command("subs", async ctx => {
  try {
    let appSubs = "";
    for (const application of await Application.find({ subscribers: { $ne: [] } })) {
      if (application.subscribers.indexOf(ctx.from.id) + 1) {
        const { year, number } = /(?<number>\d+)(?<year>\d{4})/.exec(application.index).groups
        appSubs = appSubs + year + " " + number + "\n";
      }
    }
    return appSubs != ""
      ? await ctx.replyWithHTML(ctx.i18n.t("subscribeList", { appSubs }))
      : await ctx.replyWithHTML(ctx.i18n.t("noSubscribeList"));
  } catch (e) {
    console.log(e);
    return await ctx.replyWithHTML(ctx.i18n.t("error"));
  }
})

composer.action(/(sub|unsub)\d{5,}/, (ctx) => {
  const { command, appIndex } = /(?<command>(sub|unsub))(?<appIndex>\d{5,})/.exec(ctx.match[0]).groups
  const subData = {
    userId: ctx.from.id,
    appIndex
  }
  if (command == "sub") sub(subData);
  if (command == "unsub") unsub(subData);
  ctx.editMessageReplyMarkup({
    inline_keyboard: [[{
      text: (command == "sub") ? ctx.i18n.t("unSubscribeButton") : ctx.i18n.t("subscribeButton"),
      callback_data: ((command == "sub") ? 'unsub' : 'sub') + appIndex
    }]]
  });
});

async function sub(subData) {
  try {
    const application = await Application.findOne({
      index: subData.appIndex,
    }) || await Application.create({
      index: subData.appIndex,
    });
    if (application && !(application.subscribers.indexOf(subData.userId) + 1)) {
      application.subscribers.push(subData.userId);
      await application.save()
    };
  } catch (e) {
    console.log(e);
    return await ctx.replyWithHTML(ctx.i18n.t("error"));
  }
}

async function unsub(subData) {
  try {
    const application = await Application.findOne({
      index: subData.appIndex,
    });
    if (application && (application.subscribers.indexOf(subData.userId) + 1)) {
      application.subscribers.splice(application.subscribers.indexOf(subData.userId), 1);
      await application.save()
    };
  } catch (e) {
    console.log(e);
    return await ctx.replyWithHTML(ctx.i18n.t("error"));
  }
}

module.exports = composer