const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");
const fetch = require("node-fetch");
const stream = require("stream/promises");
const { default: axios } = require("axios");

const Act = require("./models/act.model");
const Order = require("./models/order.model");
const Application = require("./models/application.model");
const Oath = require("./models/oath.model");

const oathDirectoryPath = path.resolve(process.env.BOT_ACTS_DIR || "oath");
const oathUrl =
  process.env.BOT_OATH_URL ||
  "http://cetatenie.just.ro/juramant/#1576651821062-52dd0897-6698";
const actsDirectoryPath = path.resolve(process.env.BOT_ACTS_DIR || "acts");
const actsUrl =
  process.env.BOT_ACTS_URL ||
  "http://cetatenie.just.ro/stadiu-dosar/#1576832773102-627a212f-45ce";
const ordersDirectoryPath = path.resolve(process.env.BOT_ACTS_DIR || "orders");
const ordersUrl =
  process.env.BOT_ORDERS_URL || "http://cetatenie.just.ro/ordine-articolul-11/";

async function downloadFile(url, path) {
  try {
    const { data } = await axios.get(url, { responseType: "stream" });
    const writeStream = fs.createWriteStream(path);
    await stream.pipeline(data, writeStream).catch(console.error);
  } catch (e) {
    console.error("[ERROR] " + e);
    return false;
  }
}

async function getHtmlFromUrl(url = String()) {
  try {
    if (!url) throw new Error("No url");
    const response = await fetch(url);
    if (response.status != "200")
      throw new Error("Responce status " + response.status);
    const htmlStr = await response.text();
    return String(htmlStr);
  } catch (e) {
    console.error("[ERROR] getHtmlFromUrl " + e);
    return false;
  }
}

async function getActsFromSite() {
  try {
    let acts = [];
    for await (const line of (await getHtmlFromUrl(actsUrl))
      .normalize("NFKD")
      .replace(/\s+/g, " ")
      .match(
        /(id="1576832773102-627a212f-45ce").+?(<div class="vc_tta-panel( vc_active|)")/gs
      )[0]
      .match(/(?<=<li><a href=")(.+?)(?=<\/a>.+?<\/li>)/g)) {
      const { year, fileName, link } =
        /(?<link>.+?(?<fileName>(?<=\/)(.[^/]+).pdf))">(?<year>\d{4})/.exec(
          line
        ).groups;
      acts.push({
        year: Number(year),
        filePath: path.resolve(actsDirectoryPath, fileName),
        link,
      });
    }
    return acts;
  } catch (e) {
    console.error("[ERROR] getActsFromSite " + e);
    return false;
  }
}

async function getOrdersFromSite() {
  try {
    const orders = [];
    for await (const line of (await getHtmlFromUrl(ordersUrl))
      .normalize("NFKD")
      .replace(/\s+/g, "")
      .match(
        /<li>.+?(\d{2}\.\d{2}\.\d{4}).+?<ahref="(.+?\.pdf)">(\d+\w)<\/a><\/li>/g
      )) {
      const { date, year, rawOrders } =
        /<li>.+?(?<date>\d{2}\.\d{2}\.(?<year>\d{4})).+?(?<rawOrders><ahref=".+?<\/a>)<\/li>/.exec(
          line
        ).groups;
      for await (const rawOrder of rawOrders.match(/<ahref.+?>\d+\w<\/a>/g)) {
        const { link, fileName, name } =
          /<ahref="(?<link>.+?(?<fileName>(?<=\/)(.[^/]+)\.pdf))">(?<name>\d+\w)<\/a>/g.exec(
            rawOrder
          ).groups;
        const index = (String(name) + String(year)).toUpperCase();
        orders.push({
          index,
          year: Number(year),
          name,
          date,
          filePath: path.resolve(ordersDirectoryPath, date + "_" + fileName),
          link,
        });
      }
    }
    return orders;
  } catch (e) {
    console.error("[ERROR] getOrdersFromSite " + e);
    return false;
  }
}

async function updateActs(
  actsArray = [{ year: Number(), filePath: String(), link: String() }]
) {
  try {
    if (!actsArray.length) throw Error("actsArray is empty");
    const acts = await Act.find();
    if (acts.length != actsArray.length)
      console.log(
        `[INFO] Acts on site ${actsArray.length} | Acts in base ${acts.length}`
      );
    if (acts.length > actsArray.length) {
      console.log(
        "[WARNING] Acts in DataBase more then Acts on the site. Removing orphans."
      );
      const actsYears = [];
      actsArray.forEach((act) => actsYears.push(act.year));
      for await (const act of acts) {
        if (!(actsYears.indexOf(act.year) + 1)) await act.remove();
      }
    }
    for await (const _act of actsArray) {
      const act =
        (await Act.findOne({ year: _act.year })) || (await Act.create(_act));
      console.log(`[INFO] Updating Act by ${act.year} year`);
      if (act.link != _act.link) {
        try {
          fs.unlinkSync(act.filePath);
        } catch {}
        act.link = _act.link;
        act.filePath = _act.filePath;
        act.processed = false;
        await act.save();
      }
      if (!fs.existsSync(act.filePath)) {
        process.stdout.write(
          `\r[INFO] Downloading ${
            act.filePath.match(/(?<=\/)(.[^\/]+).pdf$/g)[0]
          } `
        );
        await downloadFile(act.link, act.filePath);
        if (fs.existsSync(act.filePath)) console.log("< SUCCESS");
        else console.log("< ERROR");
      }
    }
  } catch (e) {
    console.error("[ERROR] updateActs " + e);
    return false;
  }
}

async function updateOrders(
  ordersArray = [
    {
      index: String(),
      year: Number(),
      name: String(),
      date: String(),
      filePath: String(),
      link: String(),
    },
  ]
) {
  try {
    if (!ordersArray.length) throw Error("ordersArray is empty");
    const orders = await Order.find();
    if (orders.length != ordersArray.length)
      console.log(
        `[INFO] Orders on site ${ordersArray.length} | Orders in base ${orders.length}`
      );
    if (orders.length > ordersArray.length) {
      console.log(
        "[WARNING] Orders in DataBase more then Orders on the site. Removing orphans."
      );
      const ordersIndexes = [];
      ordersArray.forEach((order) => ordersIndexes.push(order.index));
      for await (const order of orders) {
        if (!(ordersIndexes.indexOf(order.index) + 1)) await order.remove();
      }
    }
    const filesToDownload = [];
    for await (const _order of ordersArray) {
      const order =
        (await Order.findOne({ index: _order.index })) ||
        (await Order.create(_order));
      if (!fs.existsSync(_order.filePath))
        filesToDownload.push({ link: _order.link, filePath: _order.filePath });
    }
    let count = 0;
    let result = true;
    for await (const line of filesToDownload) {
      count++;
      process.stdout.write(
        `\r[INFO] Downloading Orders files. ${count} of ${filesToDownload.length} `
      );
      await downloadFile(line.link, line.filePath);
      if (!fs.existsSync(line.filePath)) result = false;
    }
    console.log(result ? "< SUCCESS" : "< ERROR");
  } catch (e) {
    console.error("[ERROR] updateOrders " + e);
    return false;
  }
}

async function getApplicationArrayFromActPdf(act) {
  try {
    const applications = Object();
    for await (const rawApp of (await pdf(fs.readFileSync(act.filePath))).text
      .normalize("NFKD")
      .replace(/[,#!$%\^&\*;:{}=\-_`~+ \+]/g, "")
      .replace(/\//g, "")
      .toLowerCase()
      .trim()
      .match(
        /(\d+)\w{2}\d{4}(\d{2}.\d{2}.\d{4}){1,2}(\d+\w\d{2}.\d{2}.\d{4})?\n/g
      )) {
      const appData =
        /(?<number>\d+)\w{2}(?<year>\d{4})(?<registrationDate>\d{2}.\d{2}.\d{4})(?<considerationDate>\d{2}.\d{2}.\d{4})?((?<orderName>\d+\w)(?<decisionDate>\d{2}.\d{2}.\d{4}))?/.exec(
          rawApp.replace(/\//g, "")
        ).groups;
      const index = (
        String(appData.number) + String(appData.year)
      ).toUpperCase();
      applications[index] = {
        index,
        registrationDate: appData.registrationDate,
        considerationDate: appData.considerationDate,
        decisionDate: appData.decisionDate,
        orderName: appData.orderName,
        actYear: act.year,
      };
    }
    return applications;
  } catch (e) {
    console.error("[ERROR] getApplicationArrayFromActPdf " + e);
    return false;
  }
}

async function getApplicationArrayFromOrderPdf(order) {
  try {
    const applications = Object();
    for await (const rawApp of (await pdf(fs.readFileSync(order.filePath))).text
      .normalize("NFKD")
      .replace(/[,#!$%\^&\*:{}=\-_`~+ \+]/g, "")
      .toLowerCase()
      .replace(/rd\//g, "")
      .replace(/;/g, ".")
      .match(/(\d+(\/|\/rd\/)\d{4}(\)?))(\.copiiminori\d+)?/g)) {
      const { number, year, minorChildrenAmount } =
        /(?<number>\d+)\/(?<year>\d{4})(\.copiiminori(?<minorChildrenAmount>\d+))?/g.exec(
          rawApp.replace(/[\(\)]/g, "")
        ).groups;
      const index = (String(number) + String(year)).toLowerCase();
      applications[index] = {
        index,
        orderIndex: order.index,
        registrationDate: undefined,
        considerationDate: undefined,
        decisionDate: order.date,
        minorChildrenAmount,
      };
    }
    return applications;
  } catch (e) {
    console.error(
      "[ERROR] getApplicationArrayFromOrderPdf " + `\n${order.filePath}\n` + e
    );
    return false;
  }
}

async function getApplicationsFromActs(actRange = Number()) {
  let applications = Object();
  for await (const act of Act.find(
    actRange
      ? { year: { $gt: (await Act.findOne().sort("-year")).year - actRange } }
      : {}
  )) {
    applications = {
      ...(await getApplicationArrayFromActPdf(act)),
      ...applications,
    };
  }
  return applications;
}

async function getApplicationsFromOrders() {
  let applications = Object();
  for await (const order of Order.find({ processed: false })) {
    applications = {
      ...(await getApplicationArrayFromOrderPdf(order)),
      ...applications,
    };
    order.processed = true;
    order.save();
  }
  return applications;
}

async function getOathFromSite() {
  const oath = [];
  for (const line of (await getHtmlFromUrl(oathUrl))
    .normalize("NFKD")
    .replace(/\s+/g, " ")
    .match(
      /(?<=<a href="#1576651821062-52dd0897-6698").+?(<\/p> <\/div> <\/div> <\/div>)/gs
    )[0]
    .match(/(<a href=".+?\.pdf">).+?\d{2}\.\d{2}\.\d{4}.+?(\d{1,2}.\d{2})/g)) {
    const { link, fileName, date, time } =
      /<a href="(?<link>.+?(?<fileName>(?<=\/)(.[^/]+).pdf))">.+?(?<date>\d{2}\.\d{2}\.\d{4}).+?(?<time>\d{1,2}.\d{2})/.exec(
        line
      ).groups;
    const { d, M, y, h, m } =
      /(?<d>\d{2}).(?<M>\d{2}).(?<y>\d{4}).(?<h>\d{1,2}).(?<m>\d{2})/.exec(
        `${date} ${time}`
      ).groups;
    const oathDateTime = Number(Date.parse(`${M}/${d}/${y} ${h}:${m}:00`));
    if (oathDateTime >= Number(Date.now())) {
      oath.push({
        link,
        filePath: path.resolve(oathDirectoryPath, fileName),
        dateTime: oathDateTime,
      });
    }
  }
  return oath;
}

async function updateOath(
  oathArray = [{ dateTime: String(), link: String(), filePath: String() }]
) {
  try {
    if (!oathArray.length) return console.log("[INFO] Oath list is empty...");
    for (const oath of oathArray) {
      if (!(await Oath.find({ dateTime: oath.dateTime })).length) {
        console.log(`[INFO] Creating oatn ${oath.filePath}`);
        Oath.create({ ...oath, processed: false });
      }
      if (!fs.existsSync(oath.filePath)) {
        console.log(`[INFO] Downloading ${oath.link}`);
        await downloadFile(oath.link, oath.filePath);
      }
    }
  } catch (e) {
    console.error("[ERROR] updateOath " + e);
    return false;
  }
}

async function processOath(updateInformCallback) {
  const coldStart = !(
    (await Act.find().count()) &&
    (await Order.find().count()) &&
    (await Application.find().count())
  );

  if (coldStart) {
    return;
  }
  try {
    if (typeof updateInformCallback !== "function")
      updateInformCallback = (a) => {
        console.log(a);
      };
    const oaths = await Oath.find().where("dateTime").gt(Number(Date.now()));
    for (const oath of oaths) {
      for (const oathOrder of (await pdf(fs.readFileSync(oath.filePath))).text
        .normalize("NFKD")
        .replace(/[,#!$%\^&\*:{}=\-_`~+ \+]/g, "")
        .toLowerCase()
        .match(/\d+\/\d{4}/g)) {
        const { orderNumber, orderYear } =
          /(?<orderNumber>\d+)\/(?<orderYear>\d{4})/.exec(oathOrder).groups;
        const applicationIndex = (
          String(orderNumber) + String(orderYear)
        ).toLowerCase();
        const application = await Application.findOne({
          index: applicationIndex,
        });
        if (!application) {
          console.log(
            `[INFO] Application ${applicationIndex} doesn't exist. Creating...`
          );
          await Application.create({
            index: applicationIndex,
            oathDateTime: oath.dateTime,
          });
          continue;
        }
        // Если не совпадают даты присяги в заявке и в файле присяги
        if (application.oathDateTime !== oath.dateTime) {
          // Зановим новую дату присяги в заявку
          application.oathDateTime = oath.dateTime;
          await application.save();
          // Оповещаем подписчиков заявки
          updateInformCallback(application);
        }
      }
    }
    console.log("[INFO]\x1b[32m < SUCCESS\x1b[0m");
  } catch (e) {
    console.error("[ERROR] parser " + e);
  }
}

async function runParseOath(updateInformCallback = (application) => {}) {
  await updateOath(await getOathFromSite());
  await processOath(updateInformCallback);
}

async function run(
  updateInformCallback = (application) => {},
  options = { actUpdateRange: Number() }
) {
  try {
    if (typeof updateInformCallback !== "function")
      updateInformCallback = (a) => {
        console.log(a);
      };
    const coldStart = !(
      (await Act.find().count()) &&
      (await Order.find().count()) &&
      (await Application.find().count())
    );
    if (coldStart) {
      await Act.deleteMany({});
      await Order.deleteMany({});
      await Application.deleteMany({});
    }
    const acts = await getActsFromSite();
    const orders = await getOrdersFromSite();
    await updateActs(acts);
    await updateOrders(orders);
    if (coldStart) {
      console.log(
        "\x1b[33m[INFO] ColdStart detected. Initialized full database update.\x1b[0m"
      );
      const applications = await getApplicationsFromActs();
      const applicationsInOrders = await getApplicationsFromOrders();
      const appllicationsIndexes = Object.keys(applications);
      const applicationsInOrdersIndexes = Object.keys(applicationsInOrders);
      for await (const index of applicationsInOrdersIndexes) {
        if (appllicationsIndexes.indexOf(index) !== -1) {
          applications[index].orderIndex =
            applicationsInOrders[index].orderIndex;
          if (!applications[index].decisionDate)
            applications[index].decisionDate =
              applicationsInOrders[index].decisionDate;
          if (applicationsInOrders[index].minorChildrenAmount)
            applications[index].minorChildrenAmount =
              applicationsInOrders[index].minorChildrenAmount;
        }
      }
      const appArray = Object.values(applications);
      if (!appArray.length) {
        throw new Error("Applications not found...");
      }
      await insertApplications(appArray);
      console.log(
        (await Application.find().count()) == appllicationsIndexes.length
          ? "\x1b[32m < SUCCESS\x1b[0m"
          : "\x1b[31m < ERROR\x1b[0m"
      );
      console.log("Adding applications from oaths...");
      await processOath(() => {});
    } else {
      console.log("[INFO] Update of applications");
      const applicationsInAct = options.actUpdateRange
        ? await getApplicationsFromActs(options.actUpdateRange)
        : {};
      const applicationsInOrders = await getApplicationsFromOrders();
      const applicationsInActIndexes = Object.keys(applicationsInAct);
      const applicationsInOrdersIndexes = Object.keys(applicationsInOrders);
      const updateIndexes = [
        ...new Set(
          applicationsInActIndexes.concat(applicationsInOrdersIndexes).sort()
        ),
      ];
      for await (const index of updateIndexes) {
        const applicationData = {
          ...applicationsInAct[index],
          ...applicationsInOrders[index],
        };
        const application = await Application.findOne({
          index: applicationData.index,
        });
        if (application) {
          if (
            application.decisionDate != applicationData.decisionDate ||
            application.considerationDate !=
              applicationData.considerationDate ||
            application.registrationDate != applicationData.registrationDate
          ) {
            if (applicationData.considerationDate)
              application.considerationDate = applicationData.considerationDate;
            if (applicationData.registrationDate)
              application.registrationDate = applicationData.registrationDate;
            if (applicationData.decisionDate)
              application.decisionDate = applicationData.decisionDate;
            if (applicationData.orderIndex)
              application.orderIndex = applicationData.orderIndex;
            if (applicationData.actYear)
              application.actYear = applicationData.actYear;
            await application.save();
            updateInformCallback(application);
          }
        } else {
          await Application.create(applicationData);
        }
      }
      console.log("[INFO] SUCCESS");
    }
  } catch (e) {
    console.error("[ERROR] parser " + e);
  }
}

async function insertApplications(apps) {
  const aStep = Math.round(apps.length / 100);

  let count = 0;
  const length = apps.length;
  process.stdout.write(
    `\r[INFO] Insert applications in database. ${Math.round(
      (count / length) * 100
    )}%`
  );
  while (apps.length) {
    if (apps.length >= aStep) {
      await Application.insertMany(apps.splice(0, aStep));
      count += aStep;
    } else {
      await Application.insertMany(apps.splice(0, apps.length));
      count += apps.length + 1;
    }
    process.stdout.write(
      `\r[INFO] Insert applications in database. ${Math.round(
        (count / length) * 100
      )}%`
    );
  }
  console.log();
}

module.exports = {
  run,
  runParseOath,
  models: {
    Order,
    Act,
    Application,
    Oath,
  },
};
