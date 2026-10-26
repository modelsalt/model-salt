// The word list the tool draws from: Webster's 2nd (1934, public domain, src/words.mjs) without crude words and slurs
// (17 Oct: a run drew "shat"). Exact matches and a few stems; everything else in the 174,323 stays.
import ALL from './words.mjs';

const EXACT = new Set(['arse', 'bastard', 'bitch', 'bollock', 'bugger', 'cock', 'crap', 'damn', 'dick', 'dyke', 'fellatio', 'harlot',
  'hell', 'incest', 'negro', 'orgasm', 'penis', 'piss', 'prick', 'pussy', 'shat', 'sodomy', 'sodomite', 'strumpet', 'turd', 'twat',
  'vagina', 'wetback', 'whore', 'slut', 'shit', 'fuck', 'cunt', 'nigger', 'faggot', 'fag', 'coon', 'darky', 'darkey', 'kike', 'spic',
  'chink', 'gook', 'retard', 'rape', 'rapist', 'tit', 'tits', 'wank', 'asshole', 'jizz', 'cum']);
const STEMS = /^(bastard|bitch|piss|whore|slut|shit|fuck|cunt|nigger|twat|wank|sodom|harlot|strumpet|negro|orgasm)/i;

const WORDS = ALL.filter((w) => !EXACT.has(w.toLowerCase()) && !STEMS.test(w));
export default WORDS;
