/**
 * Engangs-seed fra medlemsliste (regneark). Kør: node scripts/seed-kontingent-medlemsliste.mjs
 * Overskriver data/kontingent.json — betalingsfelter sættes alle til false.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { defaultBetalt } from '../kontingent-default.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, '..', 'data', 'kontingent.json');

let pid = 0;
const b = () => ({ ...defaultBetalt() });
const P = (navn, email = '', telefon = '', notat = '') => ({
  id: `p-${++pid}`,
  navn,
  email,
  telefon: telefon ? String(telefon) : '',
  notat,
  betalt: b(),
});

let lid = 0;
const L = (label, personer) => ({ id: `lod-${++lid}`, label, personer });

const lods = [
  L('Lod 1', [P('Karen Ejlersen', 'karenejlersen1@gmail.com', '22638382')]),
  L('Lod 2', [P('Erik Toft Christensen', 'erikfriland@gmail.com', '40797773')]),
  L('Lod 3', [
    P('Tonny Trifolikom', 'tonny@friland.org', '28407330'),
    P('Sofi', 'oestergaard.anne@gmail.com', '42703388'),
  ]),
  L('Lod 4', [
    P('Jakob Rasmussen', 'elbrev1@hotmail.com', '20776098'),
    P('Majken Leth Gudnitz', 'gudnitz30@hotmail.com', '25466039'),
  ]),
  L('Lod 5', [
    P('Dorthe Frisk', 'dorthefrisk@gmail.com', '50915366'),
    P('Palle', 'pallefrisk@gmail.com', '24490710'),
  ]),
  L('Lod 6', [
    P('Steen Møller', 'steenfriland@gmail.com', '21737321'),
    P('Mette Wind Ramsgaard', 'mettewindramsgaard@gmail.com', '22172618'),
  ]),
  L('Lod 7', [P('Jens Peter Mølgaard', 'jens.peter.moelgaard@gmail.com', '50171676')]),
  L('Lod 8', [
    P('Eva Bech Pedersen', 'evafriland8@gmail.com', '21442598'),
    P('Jens Christian Nielsen', 'friland8@gmail.com', '60149758'),
  ]),
  L('Lod 9', [
    P('Inge Blok Jørgensen', 'inge@friland9.dk', '22790355'),
    P('Niels', 'niels@friland9.dk', '20901112'),
  ]),
  L('Lod 10', [
    P('Henrik Friis', 'info@viden.dk', '28561531'),
    P('Sebastian', '', ''),
  ]),
  L('Lod 11', [
    P('Tove Bang', 'friland11@hotmail.com', '22649262'),
    P('Louise Obel Bank (lejer)', 'louiseobelbank@gmail.com', '', 'lejer'),
    P('Ricardo Ribiero (lejer)', '', '', 'lejer'),
    P('Alan Bjerre', 'alan@bjerre.nu', '22952292'),
  ]),
  L('Lod 12 a', [P('', '', '')]),
  L('Lod 12 b', [
    P('Joanna Morandin', 'jomorandin@gmail.com', '23900924'),
    P('Lars Keller', 'larskeller@gmail.com', '20240505'),
  ]),
  L('Lod 12 c', [
    P('Katja', '', ''),
    P('Simon', '', ''),
  ]),
  L('Lod 13', [
    P('Claus Holm Jacobsen', 'clausholmjacobsen@gmail.com', '26794500'),
    P('Nina Olsen Lauridsen', 'ninaolauridsen@gmail.com', '61331301'),
  ]),
  L('Lod 14', [
    P('John Jørgensen', 'johnogbirk@gmail.com', '61769510'),
    P('Katrine Hald', 'katrinehald@hotmail.com', '30209740'),
  ]),
  L('Lod 15', [
    P('Esben Enevoldsen Rahr', 'mrrahr@gmail.com', '61657535'),
    P('Maya Emilie Enevoldsen Rahr', 'mayafriland@gmail.com', '26854255'),
  ]),
  L('Lod 16', [P('Kent Olsen', 'kent.olsen@gmail.com', '40272030')]),
  L('Lod 17', [P('Mette Lundorff Laursen', 'mettelundorff@yahoo.dk', '')]),
  L('Lod 18', [P('Ole', 'vedfolner@hotmail.com', '41933355')]),
  L('Lod 19', [
    P('Thomas Birk Lynnerup', 'thomaslynnerup@gmail.com', '60607608'),
    P('Thea Hestbjerg', 'thea_hestbjerg@hotmail.com', '27136224'),
  ]),
  L('Lod 20', [
    P('Lone Mølleskov', 'lojopost@gmail.com', '24202488'),
    P('Johannes Mølleskov', 'lojopost@gmail.com', '29922013'),
  ]),
  L('Lod 21', [
    P('Mariane Lynge', 'marianelyng@gmail.com', '30302137'),
    P('Thomas Andersen', 'thomasa77@gmail.com', '29438031'),
  ]),
  L('Lod 22 B', [P('Birthe Blåbjerg Jakobsen', 'birthejakobsen@hotmail.com', '30273526')]),
  L('Lod 22 A', [P('Jacob Nielsen', 'fuelfinder@gmail.com', '60898955')]),
  L('Lod 22 C', [P('Helle Hestbjerg', 'helle.hestbjerg@gmail.com', '72201891')]),
  L('Lod 23', [
    P('Dennis Døngart', 'dennisdongart@hotmail.com', '29846393'),
    P('Sophia Juliane Lydolph', 'frilandsmamma@gmail.com', '28712804'),
  ]),
  L('Lod 24', [
    P('Lærke', 'leark911@hotmail.com', '26813104'),
    P('Christian', 'christianstrautins@icloud.com', '61469437'),
  ]),
  L('Lod 25', [
    P('Lise Maarbjerg', 'lisemaarbjerg@gmail.com', '20666581'),
    P('Jakob Harms Larsen', 'jakobopal@gmail.com', '24941352'),
  ]),
  L('Lod 26', [P('Pelse Asboe', 'hellepelse@gmail.com', '28101165')]),
  L('Lod 27 A', [
    P('Anna-Birthe Mokrzyczka', 'ann@amoka.dk', '60750509'),
    P('Mik Torfing', 'michael@torfing.dk', '61714700'),
  ]),
  L('Lod 27 B', [
    P('Kristine Haaber Hauch', 'kristinehaaber@hotmail.com', '22410790'),
    P('Andreas Haaber Hauch', 'andreashauch@gmail.com', '41579445'),
  ]),
  L('Lod 28', [
    P('Jane Holbæk Rønn', 'jane.h.roenn@gmail.com', '26133133'),
    P('Mark Peter Rønn', '', ''),
    P('Christian', '', ''),
  ]),
  L('Lod 29', [
    P('Ditte Waaler', 'dittewaaler@gmail.com', '23901063'),
    P('Merlin North', 'merlin.north@gmail.com', '60587413'),
  ]),
  L('Lod 30', [
    P('Karoline Nolsø Aaen', 'knaaen@gmail.com', '24233883'),
    P('Tycho Holcomb', 'tycho@friland.org', '29864778'),
  ]),
  L('Lod 31', [P('Claus Jørgensen', 'rastapus1972@hotmail.com', '28972837')]),
  L('Lod 32', [
    P('Mathias Andersen', 'mathias0andersen@gmail.com', '31772111'),
    P('Laura Bailon', 'laura.bailon@gmail.com', '29209297'),
  ]),
  L('Lod 33', [
    P('David Westervik', 'david.westervik@gmail.com', '31130951'),
    P('Alessia Ulfe Bandini', '', ''),
  ]),
  L('Lod 34', [
    P('Inger Slots', 'ingerslots@gmail.com', '61657603'),
    P('Jørgen Gudmann Hansen', 'slotshansen@gmail.com', '40315181'),
  ]),
  L('Lod 35', [
    P('Malene Lærke Kidmose Tho', 'miss.laerke@gmail.com', '42600864'),
    P('Jacob Thorsen', 'jacob@jacobthorsen.dk', '42608808'),
  ]),
  L('Lod 36', [
    P('Laila Hygebjerg', 'laila@etojeblik.dk', '41411510'),
    P('Nikolaj Hygebjerg', 'nikolaj@gamesinc.dk', '41411505'),
  ]),
  L('Lod 37 A', [
    P('"Bocaj" Jacob Hall', 'bocajhall@gmail.com', '21743065'),
    P('Ann Doris Justesen', 'adj@primanet.dk', '51786551'),
  ]),
  L('Lod 37 B', [
    P('Lars Bo Baadsgaard', 'lbbaadsgaard@gmail.com', '27102666'),
    P('Annette Holtet Larsen', 'annette.holtet.larsen@gmail.com', '23435397'),
  ]),
];

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ version: 1, lods }, null, 2), 'utf8');
console.log('Skrev', out, '(' + lods.length, 'lodder,', pid, 'personer)');
