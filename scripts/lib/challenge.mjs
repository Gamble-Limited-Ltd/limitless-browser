// TS-7: per-rep challenge class for the real-site suite and the "challenges per 100 loads" summary.
// card = the app showed its Human Check card (LB_botCheck said yes); vendor = the page shows a challenge widget or vendor script
// but the app let it through; none = neither. Never interacts with a challenge (spec 06).
const CARD = /Human Check|bot-check/i;
const VENDOR = /challenges\.cloudflare\.com|cf-chl|cf_chl|turnstile|hcaptcha|recaptcha|datadome|px-captcha|perimeterx|captcha-delivery/i;

export const classifyChallenge = (errText, pageHtml) => (CARD.test(errText || '') ? 'card' : VENDOR.test(pageHtml || '') ? 'vendor' : 'none');

// sites = the merged `sites` object (name -> { runs: [{ challenge, skipped }] }). A skipped rep is a copy, not a load.
export function challengeSummary(sites, vantage) {
  let loads = 0, card = 0, vendor = 0;
  for (const s of Object.values(sites)) for (const r of s.runs || []) {
    if (r.skipped) continue;
    loads++;
    if (r.challenge === 'card') card++; else if (r.challenge === 'vendor') vendor++;
  }
  const per100 = (n) => (loads ? +((100 * n) / loads).toFixed(1) : null);
  return { vantage, loads, card, vendor, cardPer100: per100(card), vendorPer100: per100(vendor), per100: per100(card + vendor) };
}
