import { Command } from "commander";
import { getSDK } from "../utils/sdk-factory";
import { isJson, printJson, printTable, handleError } from "../utils/output";

export function registerReferralCommands(program: Command) {
  const referral = program.command("referral").description("Referral operations");

  // === referral bind ===
  referral
    .command("bind")
    .description("Bind a referral code (e.g. referral bind trump)")
    .argument("<code>", "Referral code")
    .action(async (code) => {
      try {
        const sdk = getSDK();
        const result = await sdk.joinTeam(code);
        if (!result.status) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);
        console.log(`Referral code "${code}" bound successfully.`);
      } catch (e) {
        handleError(e);
      }
    });

  // === referral link ===
  referral
    .command("link")
    .description("Get your referral link and invite code")
    .action(async () => {
      try {
        const sdk = getSDK();
        const result = await sdk.getReferralLink();
        if (!result.status) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        const d = result.data;
        printTable(
          ["Field", "Value"],
          [
            ["Invite Code", d?.inviteCode || d?.referralCode || "-"],
            ["Referral Link", d?.referralLink || "-"],
          ]
        );
      } catch (e) {
        handleError(e);
      }
    });

  // === referral change-code ===
  referral
    .command("change-code")
    .description("Change your referral code (e.g. referral change-code mycode)")
    .argument("<code>", "New referral code")
    .action(async (code) => {
      try {
        const sdk = getSDK();
        const result = await sdk.changeReferralCode(code);
        if (!result.status) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);
        console.log(`Referral code changed to "${code}".`);
      } catch (e) {
        handleError(e);
      }
    });

  // === referral invitees ===
  referral
    .command("invitees")
    .description("List your invitees")
    .option("--page <num>", "Page number (default: 1)", "1")
    .option("--page-size <num>", "Items per page (default: 10)", "10")
    .action(async (opts) => {
      try {
        const sdk = getSDK();
        const result = await sdk.getInvitees({
          page: parseInt(opts.page, 10),
          pageSize: parseInt(opts.pageSize, 10),
        });
        if (!result.status) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        const items = result.data?.data || result.data?.items || [];
        if (!Array.isArray(items) || !items.length) return console.log("No invitees found.");

        printTable(
          ["Address", "Points", "Joined"],
          items.map((inv: any) => [
            inv.user || inv.address || inv.userAddress || "-",
            inv.basePoints ?? inv.points ?? "-",
            inv.joinedTime || "-",
          ])
        );
      } catch (e) {
        handleError(e);
      }
    });
}
