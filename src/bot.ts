import { Bot } from "grammy";
import { config } from "./config.js";
import { registerCallbackHandlers } from "./handlers/callbacks.js";
import { registerCommands } from "./handlers/commands.js";
import { registerMembershipHandler } from "./handlers/membership.js";
import { registerMessageHandler } from "./handlers/message.js";

export function createBot(): Bot {
  const bot = new Bot(config.botToken);

  registerCommands(bot);
  registerMembershipHandler(bot);
  registerMessageHandler(bot);
  registerCallbackHandlers(bot);

  bot.catch((err) => {
    console.error(`Error while handling update ${err.ctx.update.update_id}:`, err.error);
  });

  return bot;
}
