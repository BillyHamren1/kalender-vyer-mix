/**
 * Beslutsdokument-policy för rast vid timer-stopp.
 *
 * Tröskeln för när vi måste fråga användaren om rast. Pass under tröskeln
 * sparas alltid med break_time = 0 utan dialog (det finns ingen rastförväntan).
 * Pass över tröskeln öppnar StopBreakDecisionDialog så att användaren explicit
 * måste välja: ange rast / ingen rast / markera som avvikelse.
 *
 * INGEN automatisk justering görs — varken under eller över tröskeln.
 */
export const BREAK_PROMPT_THRESHOLD_HOURS = 5;

/**
 * Returnerar true om passet är så långt att rast måste hanteras explicit.
 * Just nu: > 5h, vilket matchar svensk arbetstidslag (rast efter 5h arbete).
 *
 * Notera: denna funktion AVGÖR INTE rast-värdet — den triggar bara dialogen.
 */
export function shouldPromptForBreak(passHours: number): boolean {
  return passHours > BREAK_PROMPT_THRESHOLD_HOURS;
}
