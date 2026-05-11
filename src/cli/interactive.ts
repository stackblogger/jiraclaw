import chalk from "chalk";
import inquirer from "inquirer";
import {
  flowAssignedTickets,
  flowCreateTicketInteractive,
  flowLogHoursInteractive,
  flowShowTodayLogs,
  flowUpdateTicketInteractive,
} from "../commands/workflows.js";

export async function runInteractiveMenu(cwd: string): Promise<void> {
  const { choice } = await inquirer.prompt<{ choice: string }>([
    {
      type: "list",
      name: "choice",
      message: "jiraclaw",
      choices: [
        { name: "1. Log Hours", value: "1" },
        { name: "2. Create Ticket", value: "2" },
        { name: "3. Update Ticket", value: "3" },
        { name: "4. Show Today's Logs", value: "4" },
        { name: "5. List Assigned Tickets", value: "5" },
        { name: "6. Exit", value: "6" },
      ],
      pageSize: 10,
    },
  ]);
  switch (choice) {
    case "1":
      await flowLogHoursInteractive(cwd);
      break;
    case "2":
      await flowCreateTicketInteractive(cwd);
      break;
    case "3":
      await flowUpdateTicketInteractive();
      break;
    case "4":
      await flowShowTodayLogs();
      break;
    case "5":
      await flowAssignedTickets();
      break;
    default:
      console.log(chalk.gray("Bye."));
  }
}
