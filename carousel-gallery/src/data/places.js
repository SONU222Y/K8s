// Three volumes of invented places. Every volume has exactly ten plates, so
// switching volumes swaps the carousel's images in place with a crossfade
// instead of re-running the entrance animation.

export const VOLUMES = [
  {
    id: 'highlands',
    numeral: 'I',
    name: 'Highlands',
    blurb: 'Ranges, passes and cirques above the treeline.',
    style: 'ridges',
    places: [
      { name: 'Varn Col', region: 'Northern Cordillera', coords: '46°31′N 10°27′E', elev: '2,914 m', note: 'A saddle pass that stays snow-locked until July.' },
      { name: 'The Ashen Teeth', region: 'Kaldera Range', coords: '47°02′N 9°48′E', elev: '3,402 m', note: 'Basalt spires, climbed only from the south face.' },
      { name: 'Meridel Shelf', region: 'Upper Meridel', coords: '45°58′N 7°12′E', elev: '2,260 m', note: 'A broad grazing terrace, fog-bound most mornings.' },
      { name: 'Orrin Gap', region: 'Western Marches', coords: '46°10′N 8°03′E', elev: '1,875 m', note: 'Old drovers’ road. Cairns mark the route every 200 m.' },
      { name: 'Halvard’s Crown', region: 'Kaldera Range', coords: '47°19′N 10°55′E', elev: '3,688 m', note: 'The highest summit in the atlas, first surveyed in 1904.' },
      { name: 'Sellin Tarns', region: 'Northern Cordillera', coords: '46°44′N 11°20′E', elev: '2,540 m', note: 'Seven glacial lakes; the lowest never freezes over.' },
      { name: 'Brask Ridge', region: 'Eastern Fells', coords: '48°05′N 12°41′E', elev: '2,118 m', note: 'A knife-edge traverse, four kilometres without a descent.' },
      { name: 'Cold Hollow', region: 'Upper Meridel', coords: '45°40′N 6°58′E', elev: '1,960 m', note: 'A north-facing cirque that keeps its snow through August.' },
      { name: 'Telmark Spur', region: 'Western Marches', coords: '46°27′N 7°36′E', elev: '2,733 m', note: 'Survey beacon on the summit, rebuilt in 1961.' },
      { name: 'Last Light Col', region: 'Eastern Fells', coords: '47°51′N 13°02′E', elev: '2,402 m', note: 'Named for the June sunset seen through its notch.' }
    ]
  },
  {
    id: 'littoral',
    numeral: 'II',
    name: 'Littoral',
    blurb: 'Headlands, sounds and strands between the tides.',
    style: 'coast',
    places: [
      { name: 'Saltmere Strand', region: 'Gull Coast', coords: '54°12′N 3°41′W', elev: '4 m', note: 'Eleven kilometres of shingle that shifts with every storm.' },
      { name: 'The Weeping Stacks', region: 'Orme Headlands', coords: '55°03′N 5°20′W', elev: '61 m', note: 'Sea stacks that drip fresh water from cliff springs.' },
      { name: 'Harrowby Bight', region: 'Gull Coast', coords: '53°48′N 3°02′W', elev: '0 m', note: 'Sheltered anchorage. Spring tides run nine metres.' },
      { name: 'Lantern Point', region: 'Orme Headlands', coords: '55°27′N 6°01′W', elev: '38 m', note: 'Lighthouse first lit in 1821, automated in 1987.' },
      { name: 'Cress Lagoon', region: 'Fenward Shore', coords: '52°56′N 1°12′E', elev: '1 m', note: 'Brackish lagoon held back by a single dune ridge.' },
      { name: 'Skerrow Sound', region: 'Outer Isles', coords: '57°14′N 7°33′W', elev: '0 m', note: 'A narrow strait; ferries cross only at slack water.' },
      { name: 'Oystergate', region: 'Fenward Shore', coords: '52°38′N 1°40′E', elev: '2 m', note: 'Abandoned oyster beds surface at low tide.' },
      { name: 'Cape Morrow', region: 'Outer Isles', coords: '58°01′N 6°48′W', elev: '112 m', note: 'The westernmost cliff in the atlas. Gannets from April.' },
      { name: 'Driftwood Reach', region: 'Gull Coast', coords: '54°36′N 4°15′W', elev: '3 m', note: 'A bay that gathers timber from three river mouths.' },
      { name: 'Selkie Cove', region: 'Orme Headlands', coords: '55°15′N 5°44′W', elev: '0 m', note: 'Grey seals haul out here from October to December.' }
    ]
  },
  {
    id: 'nocturnes',
    numeral: 'III',
    name: 'Nocturnes',
    blurb: 'Dark-sky country, mapped after moonrise.',
    style: 'night',
    places: [
      { name: 'Stillwater Basin', region: 'Dark-Sky Reserve', coords: '39°22′N 112°08′W', elev: '1,610 m', note: 'Bortle class 1. The Milky Way casts faint shadows.' },
      { name: 'Lantern Mesa', region: 'High Desert', coords: '36°51′N 110°24′W', elev: '1,980 m', note: 'A flat-topped butte used as a meteor-watch site.' },
      { name: 'Owlmoor', region: 'Northern Heath', coords: '61°04′N 24°30′E', elev: '140 m', note: 'Peat bog lit by aurora about forty nights a year.' },
      { name: 'Crescent Tarn', region: 'Dark-Sky Reserve', coords: '39°40′N 111°52′W', elev: '2,240 m', note: 'A still lake that mirrors the full moon whole.' },
      { name: 'Vigil Hill', region: 'High Desert', coords: '37°09′N 109°57′W', elev: '1,745 m', note: 'Observatory ruins; the dome frame still stands.' },
      { name: 'Hollow Star Fen', region: 'Northern Heath', coords: '60°48′N 25°11′E', elev: '96 m', note: 'In July the fireflies outnumber the visible stars.' },
      { name: 'Moonrise Notch', region: 'Dark-Sky Reserve', coords: '38°58′N 112°31′W', elev: '2,420 m', note: 'At the equinox the full moon rises inside the notch.' },
      { name: 'Ember Flats', region: 'High Desert', coords: '36°30′N 111°02′W', elev: '1,320 m', note: 'A salt pan that glows faintly under a waxing moon.' },
      { name: 'Coldharbour Ridge', region: 'Northern Heath', coords: '61°30′N 23°47′E', elev: '310 m', note: 'The sky stays blue at midnight for six weeks of summer.' },
      { name: 'The Quiet Field', region: 'Dark-Sky Reserve', coords: '39°05′N 112°44′W', elev: '1,530 m', note: 'No artificial light within ninety kilometres.' }
    ]
  }
];

export const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
