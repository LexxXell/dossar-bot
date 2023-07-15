async function main() {
  try {
    require('dotenv').config();

    require('./db');
    const path = require('path');

    const { Telegraf, session } = require('telegraf');
    const Extra = require('telegraf/extra');
    const TelegrafI18n = require('telegraf-i18n');

    const crontab = require('node-cron');
    const parser = require('./parser');
    const parserMinYear = Number(process.env.PARSER_MIN_YEAR ? process.env.PARSER_MIN_YEAR : 2000);
    try {
      if (String(process.env.PARSER_RUN_ON_STARTUP).toLowerCase() == 'true') {
        console.log('[INFO] Parser run on startup');
        parser.run(async (application) => {
          informSubscribers(application);
        });
        parser.runParseOath((application) => {
          informSubscribers(application);
        });
      }
    } catch {}
    if (String(process.env.PARSER_SCHEDULE_ORDERS).toLowerCase() != 'false') {
      try {
        crontab.schedule(process.env.PARSER_SCHEDULE_ORDERS, () => {
          console.log('[INFO] Parser Orders run');
          parser.run(async (application) => {
            await informSubscribers(application);
          });
        });
      } catch (e) {
        console.log('[ERROR] Failed to set perser schedule for Orders. \n' + e);
      }
      console.log('[INFO] Parser Orders launch schedule set at <' + process.env.PARSER_SCHEDULE_ORDERS + '>');
    }

    if (String(process.env.PARSER_SCHEDULE_ACTS).toLowerCase() != 'false') {
      try {
        crontab.schedule(process.env.PARSER_SCHEDULE_ACTS, () => {
          console.log('[INFO] Parser Acts&Orders run');
          parser.run(
            async (application) => {
              await informSubscribers(application);
            },
            { actUpdateRange: 5 },
          );
        });
      } catch (e) {
        console.log('[ERROR] Failed to set perser schedule for Orders. \n' + e);
      }
      console.log('[INFO] Parser Acts&Orders launch schedule set at <' + process.env.PARSER_SCHEDULE_ACTS + '>');
    }

    if (String(process.env.PARSER_SCHEDULE_OATH).toLowerCase() != 'false') {
      try {
        crontab.schedule(process.env.PARSER_SCHEDULE_OATH, () => {
          console.log('[INFO] Parser Oath run');
          parser.runParseOath(async (application) => {
            await informSubscribers(application, async (application, subscriber) => {
              application.subscribers.splice(application.subscribers.indexOf(subscriber), 1);
              await application.save();
            });
          });
        });
      } catch (e) {
        console.log('[ERROR] Failed to set perser schedule for Oath. \n' + e);
      }
      console.log('[INFO] Parser Oath launch schedule set at <' + process.env.PARSER_SCHEDULE_OATH + '>');
    }

    const BotSettings = require('./models/botSettings.model');

    let botSettings;
    if (/true/i.test(process.env.BOT_USE_ONLY_ENV_TOKEN)) {
      botSettings = { token: process.env.BOT_TOKEN };
    } else {
      botSettings = await BotSettings.findOne();
      if (!botSettings || !botSettings.token) {
        if (!botSettings) {
          botSettings = await BotSettings.create({ token: process.env.BOT_TOKEN });
        } else {
          await BotSettings.updateOne({}, { token: process.env.BOT_TOKEN });
          botSettings = await BotSettings.findOne();
        }
      }
    }

    const bot = new Telegraf(botSettings.token);
    const i18n = new TelegrafI18n({
      defaultLanguage: process.env.BOT_DEFAULT_LANGUAGE ? process.env.BOT_DEFAULT_LANGUAGE : 'ru',
      allowMissing: false,
      directory: path.resolve(__dirname, 'locales'),
    });

    bot.use(session());
    bot.use(i18n.middleware());

    bot.use(require('./composers/ownership.composer'));
    bot.use(require('./composers/start.composer'));
    bot.use(require('./composers/subscribe.composer'));

    bot.hears(/(^\d{4}(\/| )\d+$)/, async (ctx) => {
      const [appYear, appNumber] = ctx.message.text.split(/\/| /);
      const appIndex = String(appNumber) + String(appYear);
      if (!(Number(appYear) >= parserMinYear) && Number(appYear) <= Number(new Date().getFullYear())) {
        return await ctx.replyWithHTML(
          ctx.i18n.t('wrongYear', {
            minYear: parserMinYear,
            currYear: new Date().getFullYear(),
          }),
        );
      }
      const application = (await parser.models.Application.findOne({
        index: appIndex,
      })) || {
        index: appIndex,
      };
      return (await sendApplicationInfo(application, ctx)) && ctx.session.owner
        ? await ctx.replyWithHTML(ctx.i18n.t('adConsultation', { owner: ctx.session.owner }))
        : true;
    });

    bot.hears(/.+/, (ctx) => {
      ctx.replyWithHTML(ctx.i18n.t('wrongInput'));
    });

    const sendApplicationInfo = async (application, ctx) => {
      try {
        let message = ctx.i18n.t('noAppFound');
        const act = await parser.models.Act.findOne({
          year: application.actYear,
        });
        const order = await parser.models.Order.findOne({
          index: application.orderIndex,
        });
        const oath = await parser.models.Oath.findOne({
          index: application.oathDateTime,
        });
        const { appNumber, appYear } = /(?<appNumber>\d+)(?<appYear>\d{4})/.exec(application.index).groups;
        const messageData = {
          appNumber,
          appYear,
          registrationDate: application.registrationDate || '',
          considerationDate: application.considerationDate || '',
          decisionDate: application.decisionDate || '',
          orderName: String(application.orderName || '').toUpperCase() || '',
          oathDateTime: application.oathDateTime
            ? new Date(application.oathDateTime).toLocaleString([], {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '',
          minorChildrenAmount: application.minorChildrenAmount,
          link_act: act ? act.link : '',
          link_order: order ? order.link : '',
          link_oath: oath ? oath.link : '',
        };

        if (application.oathDateTime)
          message = application.minorChildrenAmount
            ? ctx.i18n.t('applicationInfo_oath_minorChildren', messageData)
            : order
            ? ctx.i18n.t('applicationInfo_oath', messageData)
            : act
            ? ctx.i18n.t('applicationInfo_oath_actOnly', messageData)
            : ctx.i18n.t('applicationInfo_oath_oathOnly', messageData);
        else if (application.decisionDate)
          if (!application.negative) {
            message = application.minorChildrenAmount
              ? ctx.i18n.t('applicationInfo_decision_minorChildren', messageData)
              : order
              ? ctx.i18n.t('applicationInfo_decision', messageData)
              : ctx.i18n.t('applicationInfo_decision_actOnly', messageData);
          } else {
            message = ctx.i18n.t('applicationInfo_negative', messageData);
          }
        else if (application.considerationDate)
          message = ctx.i18n.t(
            application.subrequest ? 'applicationInfo_consideration_subrequest' : 'applicationInfo_consideration',
            messageData,
          );
        else if (application.registrationDate) message = ctx.i18n.t('applicationInfo_registration', messageData);
        return ctx.replyWithHTML(
          message,
          !application.oathDateTime
            ? !(application.subscribers && application.subscribers.indexOf(ctx.from.id) + 1)
              ? Extra.HTML().markup((m) =>
                  m.inlineKeyboard([m.callbackButton(ctx.i18n.t('subscribeButton'), 'sub' + application.index)]),
                )
              : Extra.HTML().markup((m) =>
                  m.inlineKeyboard([m.callbackButton(ctx.i18n.t('unSubscribeButton'), 'unsub' + application.index)]),
                )
            : undefined,
        );
      } catch (e) {
        console.log(e);
        return await ctx.replyWithHTML(ctx.i18n.t('error'));
      }
    };

    const informSubscribers = async (application, callback = async (application, subscriber) => {}) => {
      try {
        if (!application.subscribers || application.oathDateTime < Date.now()) return;
        for (subscriber of application.subscribers) {
          const ctx = {
            from: { id: Number(subscriber) },
            replyWithHTML: async (msg = String()) => {
              try {
                await bot.telegram.sendMessage(subscriber, msg, {
                  parse_mode: 'HTML',
                });
              } catch {}
            },
            i18n: {
              t: (resourceKey = String(), templateData = Object()) => {
                return i18n.t(
                  process.env.BOT_DEFAULT_LANGUAGE ? process.env.BOT_DEFAULT_LANGUAGE : 'ru',
                  resourceKey,
                  templateData,
                );
              },
            },
          };
          const { appNumber, appYear } = /(?<appNumber>\d+)(?<appYear>\d{4})/.exec(application.index).groups;
          await ctx.replyWithHTML(
            ctx.i18n.t(application.subrequest ? 'subscriberInfo_subrequest' : 'subscriberInfo', {
              applicationNumber: appNumber,
              applicationYear: appYear,
            }),
          );
          await sendApplicationInfo(application, ctx);
          try {
            await callback(application, subscriber);
          } catch (e) {
            const fs = require('fs');
            fs.writeFileSync('sendInfoCallback.txt', e);
          }
        }
      } catch (e) {
        console.log(e);
        return await ctx.replyWithHTML(ctx.i18n.t('error'));
      }
    };

    bot.launch();
  } catch (e) {
    console.log('[CRITICAL ERROR] ' + e);
  }
}

main();
