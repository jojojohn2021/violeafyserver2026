/**
 * Shared Botanical & 6-Language Native Regional Name Dictionary + Script Transliteration Fallback
 * Used by both client (`aiProductContentApi.ts`) and server (`aiProductContentService.ts`)
 * so Ayurvedic / botanical products always receive authentic Malayalam, Hindi, Tamil, Kannada,
 * and Telugu native-script names (never English-plus-language-label placeholders).
 */

export interface BotanicalRegionalProfile {
  keywords: string[];
  botanical_name: string;
  family: string;
  sanskrit_name: string;
  translations: {
    ml: string;
    hi: string;
    ta: string;
    kn: string;
    te: string;
  };
}

export const BOTANICAL_REGIONAL_PROFILES: BotanicalRegionalProfile[] = [
  {
    keywords: ['kadukka', 'kadukkai', 'haritaki', 'harad', 'chebulic myrobalan', 'terminalia chebula', 'karakkaya', 'alalekai'],
    botanical_name: 'Terminalia chebula',
    family: 'Combretaceae',
    sanskrit_name: 'हरीतकी (Haritaki)',
    translations: {
      ml: 'കടുക്ക',
      hi: 'हरड़ (हरीतकी)',
      ta: 'கடுக்காய்',
      kn: 'ಅಳಲೆಕಾಯಿ (ಹರೀತಕಿ)',
      te: 'కరక్కాయ',
    },
  },
  {
    keywords: ['amla', 'nellikka', 'nellikkai', 'amalaki', 'gooseberry', 'phyllanthus emblica', 'usirikaya'],
    botanical_name: 'Phyllanthus emblica',
    family: 'Phyllanthaceae',
    sanskrit_name: 'आमलकी (Amalaki)',
    translations: {
      ml: 'നെല്ലിക്ക',
      hi: 'आंवला',
      ta: 'நெல்லிக்காய்',
      kn: 'ನೆಲ್ಲಿಕಾಯಿ',
      te: 'ఉసిరికాయ',
    },
  },
  {
    keywords: ['thippili', 'thippali', 'pippali', 'long pepper', 'piper longum', 'hippali'],
    botanical_name: 'Piper longum',
    family: 'Piperaceae',
    sanskrit_name: 'पिप्पली (Pippali)',
    translations: {
      ml: 'തിപ്പലി',
      hi: 'पिप्पली (पीपल)',
      ta: 'திப்பிலி',
      kn: 'ಹಿಪ್ಪಲಿ',
      te: 'పిప్పళ్ళు',
    },
  },
  {
    keywords: ['chukku', 'sukku', 'dry ginger', 'dried ginger', 'sonth', 'shunti', 'ginger'],
    botanical_name: 'Zingiber officinale',
    family: 'Zingiberaceae',
    sanskrit_name: 'शुण्ठी (Shunthi)',
    translations: {
      ml: 'ചുക്ക്',
      hi: 'सोंठ',
      ta: 'சுக்கு',
      kn: 'ಒಣ ಶುಂಠಿ',
      te: 'శొంఠి',
    },
  },
  {
    keywords: ['kasturi manjal', 'kasthuri manjal', 'wild turmeric', 'curcuma aromatica'],
    botanical_name: 'Curcuma aromatica',
    family: 'Zingiberaceae',
    sanskrit_name: 'वनहरिद्रा (Vana Haridra)',
    translations: {
      ml: 'കസ്തൂരി മഞ്ഞൾ',
      hi: 'कस्तूरी हल्दी',
      ta: 'கஸ்தூரி மஞ்சள்',
      kn: 'ಕಸ್ತೂರಿ ಅರಿಶಿನ',
      te: 'కస్తూరి పసుపు',
    },
  },
  {
    keywords: ['turmeric', 'haldi', 'manjal', 'haridra', 'curcuma longa', 'lakadong'],
    botanical_name: 'Curcuma longa',
    family: 'Zingiberaceae',
    sanskrit_name: 'हरिद्रा (Haridra)',
    translations: {
      ml: 'മഞ്ഞൾ',
      hi: 'हल्दी',
      ta: 'மஞ்சள்',
      kn: 'ಅರಿಶಿನ',
      te: 'పసుపు',
    },
  },
  {
    keywords: ['black pepper', 'pepper', 'kurumulaku', 'kali mirch', 'maricha', 'piper nigrum', 'milagu'],
    botanical_name: 'Piper nigrum',
    family: 'Piperaceae',
    sanskrit_name: 'मरिच (Maricha)',
    translations: {
      ml: 'കുരുമുളക്',
      hi: 'काली मिर्च',
      ta: 'கருப்பு மிளகு',
      kn: 'ಕಪ್ಪು ಮೆಣಸು',
      te: 'నల్ల మిరియాలు',
    },
  },
  {
    keywords: ['cardamom', 'elaichi', 'elakka', 'elakkai', 'sukshmaila', 'elettaria'],
    botanical_name: 'Elettaria cardamomum',
    family: 'Zingiberaceae',
    sanskrit_name: 'सूक्ष्मैला (Sukshmaila)',
    translations: {
      ml: 'ഏലയ്ക്ക',
      hi: 'हरी इलायची',
      ta: 'ஏலக்காய்',
      kn: 'ಏಲಕ್ಕಿ',
      te: 'యాలకులు',
    },
  },
  {
    keywords: ['cumin', 'jeera', 'jeerakam', 'seeragam', 'cuminum cyminum'],
    botanical_name: 'Cuminum cyminum',
    family: 'Apiaceae',
    sanskrit_name: 'जीरक (Jeeraka)',
    translations: {
      ml: 'ജീരകം',
      hi: 'जीरा',
      ta: 'சீரகம்',
      kn: 'ಜೀರಿಗೆ',
      te: 'జీలకర్ర',
    },
  },
  {
    keywords: ['fennel', 'perumjeerakam', 'saunf', 'sombu', 'foeniculum'],
    botanical_name: 'Foeniculum vulgare',
    family: 'Apiaceae',
    sanskrit_name: 'मिश्रेया (Mishreya)',
    translations: {
      ml: 'പെരുംജീരകം',
      hi: 'सौंफ',
      ta: 'சோம்பு',
      kn: 'ಸೋಂಪು',
      te: 'సోంపు',
    },
  },
  {
    keywords: ['coriander', 'malli', 'dhania', 'dhaniya', 'coriandrum'],
    botanical_name: 'Coriandrum sativum',
    family: 'Apiaceae',
    sanskrit_name: 'धान्यक (Dhanyaka)',
    translations: {
      ml: 'മല്ലി',
      hi: 'धनिया',
      ta: 'கொத்தமல்லி விதை',
      kn: 'ಕೊತ್ತಂಬರಿ ಬೀಜ',
      te: 'ధనియాలు',
    },
  },
  {
    keywords: ['fenugreek', 'uluva', 'methi', 'vendhayam', 'menthya', 'menthulu'],
    botanical_name: 'Trigonella foenum-graecum',
    family: 'Fabaceae',
    sanskrit_name: 'मेथिका (Methika)',
    translations: {
      ml: 'ഉലുവ',
      hi: 'मेथी दाना',
      ta: 'வெந்தயம்',
      kn: 'ಮೆಂತ್ಯ',
      te: 'మెంతులు',
    },
  },
  {
    keywords: ['clove', 'grambu', 'laung', 'lavang', 'krambu', 'syzygium aromaticum'],
    botanical_name: 'Syzygium aromaticum',
    family: 'Myrtaceae',
    sanskrit_name: 'लवङ्ग (Lavanga)',
    translations: {
      ml: 'ഗ്രാമ്പൂ',
      hi: 'लौंग',
      ta: 'கிராம்பு',
      kn: 'ಲವಂಗ',
      te: 'లవంగాలు',
    },
  },
  {
    keywords: ['cinnamon', 'karugapatta', 'dalchini', 'pattai', 'cinnamomum'],
    botanical_name: 'Cinnamomum verum',
    family: 'Lauraceae',
    sanskrit_name: 'त्वक् (Twak)',
    translations: {
      ml: 'കറുവാപ്പട്ട',
      hi: 'दालचीनी',
      ta: 'இலவங்கப்பட்டை',
      kn: 'ದಾಲ್ಚಿನ್ನಿ',
      te: 'దాల్చిన చెక్క',
    },
  },
  {
    keywords: ['nutmeg', 'jathikka', 'jaiphal', 'jathikkai', 'myristica'],
    botanical_name: 'Myristica fragrans',
    family: 'Myristicaceae',
    sanskrit_name: 'जातीफल (Jatiphala)',
    translations: {
      ml: 'ജാതിക്ക',
      hi: 'जायफल',
      ta: 'ஜாதிக்காய்',
      kn: 'ಜಾಯಿಕಾಯಿ',
      te: 'జాజికాయ',
    },
  },
  {
    keywords: ['mace', 'jathipathri', 'javitri', 'jathipathiri'],
    botanical_name: 'Myristica fragrans (Aril)',
    family: 'Myristicaceae',
    sanskrit_name: 'जातीपत्री (Jatipatri)',
    translations: {
      ml: 'ജാതിപത്രി',
      hi: 'जावित्री',
      ta: 'ஜாதிபத்திரி',
      kn: 'ಜಾಪತ್ರೆ',
      te: 'జాపత్రి',
    },
  },
  {
    keywords: ['star anise', 'thakkolam', 'chakra phool', 'annasi poo'],
    botanical_name: 'Illicium verum',
    family: 'Schisandraceae',
    sanskrit_name: 'तक्कोल (Takkola)',
    translations: {
      ml: 'തക്കോലം',
      hi: 'चक्र फूल',
      ta: 'அன்னாசிப்பூ',
      kn: 'ಚಕ್ರ ಮೊಗ್ಗು',
      te: 'అనాస పువ్వు',
    },
  },
  {
    keywords: ['ajwain', 'ayamodakam', 'omam', 'carom', 'trachyspermum'],
    botanical_name: 'Trachyspermum ammi',
    family: 'Apiaceae',
    sanskrit_name: 'यवानी (Yavani)',
    translations: {
      ml: 'അയമോദകം',
      hi: 'अजवाइन',
      ta: 'ஓமம்',
      kn: 'ಓಂ ಕಾಳು',
      te: 'వాము',
    },
  },
  {
    keywords: ['asafoetida', 'kayam', 'hing', 'perungayam', 'inguva'],
    botanical_name: 'Ferula assa-foetida',
    family: 'Apiaceae',
    sanskrit_name: 'हिङ्गु (Hingu)',
    translations: {
      ml: 'കായം',
      hi: 'हींग',
      ta: 'பெருங்காயம்',
      kn: 'ಇಂಗು',
      te: 'ఇంగువ',
    },
  },
  {
    keywords: ['mustard', 'kadugu', 'rai', 'sarson', 'aavalu'],
    botanical_name: 'Brassica juncea',
    family: 'Brassicaceae',
    sanskrit_name: 'सर्षप (Sarshapa)',
    translations: {
      ml: 'കടുക്',
      hi: 'सरसों (राई)',
      ta: 'கடுகு',
      kn: 'ಸಾಸಿವೆ',
      te: 'ఆవాలు',
    },
  },
  {
    keywords: ['ashwagandha', 'amukkuram', 'amukkura', 'withania somnifera'],
    botanical_name: 'Withania somnifera',
    family: 'Solanaceae',
    sanskrit_name: 'अश्वगन्धा (Ashwagandha)',
    translations: {
      ml: 'അമുക്കുരം (അശ്വഗന്ധ)',
      hi: 'अश्वगंधा',
      ta: 'அமுக்கரா (அஸ்வகந்தா)',
      kn: 'ಅಶ್ವಗಂಧ',
      te: 'అశ్వగంధ',
    },
  },
  {
    keywords: ['brahmi', 'bacopa', 'neerbrahmi', 'vallarai'],
    botanical_name: 'Bacopa monnieri',
    family: 'Plantaginaceae',
    sanskrit_name: 'ब्राह्मी (Brahmi)',
    translations: {
      ml: 'ബ്രഹ്മി',
      hi: 'ब्राह्मी',
      ta: 'பிரம்மி',
      kn: 'ಬ್ರಾಹ್ಮಿ',
      te: 'బ్రాహ్మి',
    },
  },
  {
    keywords: ['triphala', 'thriphala'],
    botanical_name: 'Terminalia chebula, T. bellirica & Phyllanthus emblica',
    family: 'Combretaceae / Phyllanthaceae',
    sanskrit_name: 'त्रिफला (Triphala)',
    translations: {
      ml: 'ത്രിഫല',
      hi: 'त्रिफला',
      ta: 'திரிபலா',
      kn: 'ತ್ರಿಫಲ',
      te: 'త్రిఫల',
    },
  },
  {
    keywords: ['thanikka', 'thannikka', 'bibhitaki', 'baheda', 'terminalia bellirica'],
    botanical_name: 'Terminalia bellirica',
    family: 'Combretaceae',
    sanskrit_name: 'बिभीतकी (Bibhitaki)',
    translations: {
      ml: 'താന്നിക്ക',
      hi: 'बहेड़ा',
      ta: 'தான்றிக்காய்',
      kn: 'ತಾರೆಕಾಯಿ',
      te: 'తానికాయ',
    },
  },
  {
    keywords: ['shatavari', 'sathavari', 'shathavari', 'asparagus racemosus'],
    botanical_name: 'Asparagus racemosus',
    family: 'Asparagaceae',
    sanskrit_name: 'शतावरी (Shatavari)',
    translations: {
      ml: 'ശതാവരി',
      hi: 'शतावरी',
      ta: 'தண்ணீர்விட்டான் கிழங்கு (சதாவரி)',
      kn: 'ಶತಾವರಿ',
      te: 'శతావరి',
    },
  },
  {
    keywords: ['moringa', 'muringa', 'drumstick leaf', 'murungai'],
    botanical_name: 'Moringa oleifera',
    family: 'Moringaceae',
    sanskrit_name: 'शिग्रु (Shigru)',
    translations: {
      ml: 'മുരിങ്ങയില',
      hi: 'सहजन (मोरिंगा)',
      ta: 'முருங்கை இலை',
      kn: 'ನುಗ್ಗೆ ಸೊಪ್ಪು',
      te: 'మునగ ఆకు',
    },
  },
  {
    keywords: ['tulsi', 'thulasi', 'holy basil', 'ocimum'],
    botanical_name: 'Ocimum tenuiflorum',
    family: 'Lamiaceae',
    sanskrit_name: 'तुलसी (Tulasi)',
    translations: {
      ml: 'തുളസി',
      hi: 'तुलसी',
      ta: 'துளசி',
      kn: 'ತುಳಸಿ',
      te: 'తులసి',
    },
  },
  {
    keywords: ['neem', 'veppu', 'aryaveppu', 'azadirachta'],
    botanical_name: 'Azadirachta indica',
    family: 'Meliaceae',
    sanskrit_name: 'निम्ब (Nimba)',
    translations: {
      ml: 'ആര്യവേപ്പ്',
      hi: 'नीम',
      ta: 'வேம்பு',
      kn: 'ಬೇವು',
      te: 'వేప',
    },
  },
  {
    keywords: ['licorice', 'liquorice', 'mulethi', 'irattimadhuram', 'athimadhuram', 'yashtimadhu'],
    botanical_name: 'Glycyrrhiza glabra',
    family: 'Fabaceae',
    sanskrit_name: 'यष्टिमधु (Yashtimadhu)',
    translations: {
      ml: 'ഇരട്ടിമധുരം',
      hi: 'मुलेठी',
      ta: 'அதிமதுரம்',
      kn: 'ಜೇಷ್ಠಮಧು',
      te: 'అతిమధురం',
    },
  },
  {
    keywords: ['vayambu', 'vasambu', 'vacha', 'sweet flag', 'acorus calamus'],
    botanical_name: 'Acorus calamus',
    family: 'Acoraceae',
    sanskrit_name: 'वचा (Vacha)',
    translations: {
      ml: 'വയമ്പ്',
      hi: 'बच (वचा)',
      ta: 'வசம்பு',
      kn: 'ಬಜೆ',
      te: 'వస',
    },
  },
  {
    keywords: ['kacholam', 'kachooram', 'karchura', 'kaempferia galanga'],
    botanical_name: 'Kaempferia galanga',
    family: 'Zingiberaceae',
    sanskrit_name: 'कचूर (Karchura)',
    translations: {
      ml: 'കച്ചോലം',
      hi: 'कचूर',
      ta: 'கிச்சிலி கிழங்கு',
      kn: 'ಕಚೋರ',
      te: 'కచోరాలు',
    },
  },
  {
    keywords: ['bhringraj', 'kayyonni', 'karisalankanni', 'eclipta'],
    botanical_name: 'Eclipta prostrata',
    family: 'Asteraceae',
    sanskrit_name: 'भृङ्गराज (Bhringaraja)',
    translations: {
      ml: 'കയ്യോന്നി',
      hi: 'भृंगराज',
      ta: 'கரிசலாங்கண்ணி',
      kn: 'ಗರುಗದ ಸೊಪ್ಪು',
      te: 'గుంటగలగరాకు',
    },
  },
  {
    keywords: ['hibiscus', 'chembarathi', 'sembaruthi', 'gudhal'],
    botanical_name: 'Hibiscus rosa-sinensis',
    family: 'Malvaceae',
    sanskrit_name: 'जपा (Japa)',
    translations: {
      ml: 'ചെമ്പരത്തി',
      hi: 'गुड़हल',
      ta: 'செம்பருத்தி',
      kn: 'ದಾಸವಾಳ',
      te: 'మందారం',
    },
  },
  {
    keywords: ['vetiver', 'ramacham', 'vettiver', 'khus'],
    botanical_name: 'Chrysopogon zizanioides',
    family: 'Poaceae',
    sanskrit_name: 'उशीर (Ushira)',
    translations: {
      ml: 'രാമച്ചം',
      hi: 'खस (उशीर)',
      ta: 'வெட்டிவேர்',
      kn: 'ಲಾವಂಚ',
      te: 'వట్టివేరు',
    },
  },
  {
    keywords: ['sandalwood', 'chandanam', 'chandan', 'santalum'],
    botanical_name: 'Santalum album',
    family: 'Santalaceae',
    sanskrit_name: 'चन्दन (Chandana)',
    translations: {
      ml: 'ചന്ദനം',
      hi: 'चंदन',
      ta: 'சந்தனம்',
      kn: 'ಶ್ರೀಗಂಧ',
      te: 'చందనం',
    },
  },
  {
    keywords: ['guduchi', 'giloy', 'chittamruthu', 'amrita', 'tinospora'],
    botanical_name: 'Tinospora cordifolia',
    family: 'Menispermaceae',
    sanskrit_name: 'गुडूची (Guduchi)',
    translations: {
      ml: 'ചിറ്റമൃത്',
      hi: 'गिलोय (गुडूची)',
      ta: 'சீந்தில் கொடி',
      kn: 'ಅಮೃತಬಳ್ಳಿ',
      te: 'తిప్పతీగ',
    },
  },
  {
    keywords: ['aloe vera', 'kattarvazha', 'katrazhai', 'ghritkumari'],
    botanical_name: 'Aloe barbadensis miller',
    family: 'Asphodelaceae',
    sanskrit_name: 'कुमारी (Kumari)',
    translations: {
      ml: 'കറ്റാർവാഴ',
      hi: 'एलोवेरा (घृतकुमारी)',
      ta: 'கற்றாழை',
      kn: 'ಲೋಳೆಸರ',
      te: 'కలబంద',
    },
  },
  {
    keywords: ['sesame', 'ellu', 'til', 'gingelly', 'nuvvulu'],
    botanical_name: 'Sesamum indicum',
    family: 'Pedaliaceae',
    sanskrit_name: 'तिल (Tila)',
    translations: {
      ml: 'എള്ള്',
      hi: 'तिल',
      ta: 'எள்',
      kn: 'ಎಳ್ಳು',
      te: 'నువ్వులు',
    },
  },
  {
    keywords: ['coconut', 'thenga', 'nariyal', 'thengai', 'kobbari'],
    botanical_name: 'Cocos nucifera',
    family: 'Arecaceae',
    sanskrit_name: 'नारिकेल (Narikela)',
    translations: {
      ml: 'തേങ്ങ',
      hi: 'नारियल',
      ta: 'தேங்காய்',
      kn: 'ತೆಂಗಿನಕಾಯಿ',
      te: 'కొబ్బరి',
    },
  },
  {
    keywords: ['honey', 'then', 'shahad', 'madhu', 'jenu'],
    botanical_name: 'Natural Apis Mellifera / Wild Forest Honey',
    family: 'Natural Hive Product',
    sanskrit_name: 'मधु (Madhu)',
    translations: {
      ml: 'തേൻ',
      hi: 'शहद',
      ta: 'தேன்',
      kn: 'ಜೇನುತುಪ್ಪ',
      te: 'తేనె',
    },
  },
  {
    keywords: ['almond', 'badam', 'prunus dulcis'],
    botanical_name: 'Prunus dulcis',
    family: 'Rosaceae',
    sanskrit_name: 'वाताद (Vatada)',
    translations: {
      ml: 'ബദാം',
      hi: 'बादाम',
      ta: 'பாதாம்',
      kn: 'ಬಾದಾಮಿ',
      te: 'బాదం',
    },
  },
  {
    keywords: ['cashew', 'kasuvandi', 'kaju', 'mundhiri'],
    botanical_name: 'Anacardium occidentale',
    family: 'Anacardiaceae',
    sanskrit_name: 'काजतक (Kajutaka)',
    translations: {
      ml: 'കശുവണ്ടി',
      hi: 'काजू',
      ta: 'முந்திரி',
      kn: 'ಗೋಡಂಬಿ',
      te: 'జీడిపప్పు',
    },
  },
  {
    keywords: ['dates', 'eenthappazham', 'khajoor', 'pericham'],
    botanical_name: 'Phoenix dactylifera',
    family: 'Arecaceae',
    sanskrit_name: 'खर्जूर (Kharjura)',
    translations: {
      ml: 'ഈന്തപ്പഴം',
      hi: 'खजूर',
      ta: 'பேரீச்சம்பழம்',
      kn: 'ಖರ್ಜೂರ',
      te: 'ఖర్జూరం',
    },
  },
  {
    keywords: ['raisin', 'kishmish', 'unakka munthiri', 'draksha'],
    botanical_name: 'Vitis vinifera',
    family: 'Vitaceae',
    sanskrit_name: 'द्राक्षा (Draksha)',
    translations: {
      ml: 'ഉണക്കമുന്തിരി',
      hi: 'किशमिश',
      ta: 'உலர் திராட்சை',
      kn: 'ಒಣ ದ್ರಾಕ್ಷಿ',
      te: 'ఎండు ద్రాక్ష',
    },
  },
  {
    keywords: ['fig', 'athippazham', 'anjeer', 'ficus carica'],
    botanical_name: 'Ficus carica',
    family: 'Moraceae',
    sanskrit_name: 'अञ्जीर (Anjira)',
    translations: {
      ml: 'അത്തിപ്പഴം',
      hi: 'अंजीर',
      ta: 'அத்திப்பழம்',
      kn: 'ಅಂಜೂರ',
      te: 'అంజీర',
    },
  },
];

export function lookupBotanicalRegionalProfile(productName: string): BotanicalRegionalProfile | null {
  const lower = String(productName || '').toLowerCase().trim();
  if (!lower) return null;
  // Prefer longer keyword match first (e.g. "kasturi manjal" before "manjal", "dry ginger" before "ginger")
  let best: { profile: BotanicalRegionalProfile; len: number } | null = null;
  for (const profile of BOTANICAL_REGIONAL_PROFILES) {
    for (const kw of profile.keywords) {
      if (lower.includes(kw) && (!best || kw.length > best.len)) {
        best = { profile, len: kw.length };
      }
    }
  }
  return best ? best.profile : null;
}

/**
 * Lightweight phonetic transliterator from Latin to Indic scripts so any uncommon product name
 * not in the curated dictionary still renders in authentic native script (never "Name (മലയാളം)").
 */
const SCRIPT_TABLES: Record<'ml' | 'hi' | 'ta' | 'kn' | 'te', Record<string, string>> = {
  ml: {
    kh: 'ഖ', gh: 'ഘ', ch: 'ച', jh: 'ഝ', th: 'ത', dh: 'ധ', ph: 'ഫ', bh: 'ഭ', sh: 'ശ', ng: 'ങ', ny: 'ഞ',
    aa: 'ആ', ee: 'ഈ', oo: 'ഊ', ai: 'ഐ', au: 'ഔ',
    a: 'അ', e: 'എ', i: 'ഇ', o: 'ഒ', u: 'ഉ',
    k: 'ക', g: 'ഗ', c: 'ക', j: 'ജ', t: 'ട', d: 'ഡ', n: 'ന', p: 'പ', b: 'ബ', m: 'മ',
    y: 'യ', r: 'ര', l: 'ല', v: 'വ', w: 'വ', s: 'സ', h: 'ഹ', f: 'ഫ', z: 'സ', q: 'ക', x: 'ക്സ',
  },
  hi: {
    kh: 'ख', gh: 'घ', ch: 'च', jh: 'झ', th: 'थ', dh: 'ध', ph: 'फ', bh: 'भ', sh: 'श', ng: 'ङ', ny: 'ञ',
    aa: 'आ', ee: 'ई', oo: 'ऊ', ai: 'ऐ', au: 'औ',
    a: 'अ', e: 'ए', i: 'इ', o: 'ओ', u: 'उ',
    k: 'क', g: 'ग', c: 'क', j: 'ज', t: 'त', d: 'द', n: 'न', p: 'प', b: 'ब', m: 'म',
    y: 'य', r: 'र', l: 'ल', v: 'व', w: 'व', s: 'स', h: 'ह', f: 'फ', z: 'ज़', q: 'क', x: 'क्स',
  },
  ta: {
    kh: 'க', gh: 'க', ch: 'ச', jh: 'ஜ', th: 'த', dh: 'த', ph: 'ப', bh: 'ப', sh: 'ஷ', ng: 'ங', ny: 'ஞ',
    aa: 'ஆ', ee: 'ஈ', oo: 'ஊ', ai: 'ஐ', au: 'ஔ',
    a: 'அ', e: 'எ', i: 'இ', o: 'ஒ', u: 'உ',
    k: 'க', g: 'க', c: 'க', j: 'ஜ', t: 'ட', d: 'ட', n: 'ன', p: 'ப', b: 'ப', m: 'ம',
    y: 'ய', r: 'ர', l: 'ல', v: 'வ', w: 'வ', s: 'ச', h: 'ஹ', f: 'ப', z: 'ழ', q: 'க', x: 'க்ஸ',
  },
  kn: {
    kh: 'ಖ', gh: 'ಘ', ch: 'ಚ', jh: 'ಝ', th: 'ಥ', dh: 'ಧ', ph: 'ಫ', bh: 'ಭ', sh: 'ಶ', ng: 'ಙ', ny: 'ಞ',
    aa: 'ಆ', ee: 'ಈ', oo: 'ಊ', ai: 'ಐ', au: 'ಔ',
    a: 'ಅ', e: 'ಎ', i: 'ಇ', o: 'ಒ', u: 'ಉ',
    k: 'ಕ', g: 'ಗ', c: 'ಕ', j: 'ಜ', t: 'ತ', d: 'ದ', n: 'ನ', p: 'ಪ', b: 'ಬ', m: 'ಮ',
    y: 'ಯ', r: 'ರ', l: 'ಲ', v: 'ವ', w: 'ವ', s: 'ಸ', h: 'ಹ', f: 'ಫ', z: 'ಜ', q: 'ಕ', x: 'ಕ್ಸ',
  },
  te: {
    kh: 'ఖ', gh: 'ఘ', ch: 'చ', jh: 'ఝ', th: 'థ', dh: 'ధ', ph: 'ఫ', bh: 'భ', sh: 'శ', ng: 'ఙ', ny: 'ఞ',
    aa: 'ఆ', ee: 'ఈ', oo: 'ఊ', ai: 'ఐ', au: 'ఔ',
    a: 'అ', e: 'ఎ', i: 'ఇ', o: 'ఒ', u: 'ఉ',
    k: 'క', g: 'గ', c: 'క', j: 'జ', t: 'త', d: 'ద', n: 'న', p: 'ప', b: 'బ', m: 'మ',
    y: 'య', r: 'ర', l: 'ల', v: 'వ', w: 'వ', s: 'స', h: 'హ', f: 'ఫ', z: 'జ', q: 'క', x: 'క్స',
  },
};

const MATRA_TABLES: Record<'ml' | 'hi' | 'ta' | 'kn' | 'te', Record<string, string>> = {
  ml: { aa: 'ാ', ee: 'ീ', oo: 'ൂ', ai: 'ൈ', au: 'ൗ', a: '', i: 'ി', u: 'ു', e: 'െ', o: 'ൊ' },
  hi: { aa: 'ा', ee: 'ी', oo: 'ू', ai: 'ै', au: 'ौ', a: '', i: 'ि', u: 'ु', e: 'े', o: 'ो' },
  ta: { aa: 'ா', ee: 'ீ', oo: 'ூ', ai: 'ை', au: 'ௌ', a: '', i: 'ி', u: 'ு', e: 'ெ', o: 'ொ' },
  kn: { aa: 'ಾ', ee: 'ೀ', oo: 'ೂ', ai: 'ೈ', au: 'ೌ', a: '', i: 'ಿ', u: 'ು', e: 'ೆ', o: 'ೊ' },
  te: { aa: 'ా', ee: 'ీ', oo: 'ూ', ai: 'ై', au: 'ౌ', a: '', i: 'ి', u: 'ు', e: 'ె', o: 'ొ' },
};

const VIRAMA: Record<'ml' | 'hi' | 'ta' | 'kn' | 'te', string> = {
  ml: '്',
  hi: '्',
  ta: '்',
  kn: '್',
  te: '్',
};

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

export function transliterateToIndicScript(text: string, lang: 'ml' | 'hi' | 'ta' | 'kn' | 'te'): string {
  const table = SCRIPT_TABLES[lang];
  const matras = MATRA_TABLES[lang];
  const virama = VIRAMA[lang];
  const clean = String(text || '').replace(/\([^)]*\)/g, '').trim();
  if (!clean) return '';

  return clean
    .split(/\s+/)
    .map((word) => {
      const w = word.toLowerCase().replace(/[^a-z]/g, '');
      if (!w) return '';
      let out = '';
      let i = 0;
      let prevWasConsonant = false;
      while (i < w.length) {
        const two = w.slice(i, i + 2);
        if (two.length === 2 && two in matras && prevWasConsonant) {
          out += matras[two];
          prevWasConsonant = false;
          i += 2;
          continue;
        }
        if (two.length === 2 && two in table && !VOWELS.has(two[0])) {
          if (prevWasConsonant) out += virama;
          out += table[two];
          prevWasConsonant = true;
          i += 2;
          continue;
        }
        const one = w[i];
        if (VOWELS.has(one)) {
          if (prevWasConsonant) {
            out += matras[one] ?? '';
          } else {
            out += (two.length === 2 && two in table ? table[two] : table[one]) ?? '';
            if (two.length === 2 && two in table) i += 1;
          }
          prevWasConsonant = false;
        } else if (one in table) {
          if (prevWasConsonant) out += virama;
          out += table[one];
          prevWasConsonant = true;
        }
        i += 1;
      }
      if (prevWasConsonant && lang === 'ml') {
        out += virama;
      }
      return out;
    })
    .filter(Boolean)
    .join(' ');
}

export function resolveRegionalProductNames(productName: string): {
  ml: string;
  hi: string;
  ta: string;
  kn: string;
  te: string;
  profile: BotanicalRegionalProfile | null;
} {
  const profile = lookupBotanicalRegionalProfile(productName);
  if (profile) {
    return {
      ...profile.translations,
      profile,
    };
  }
  return {
    ml: transliterateToIndicScript(productName, 'ml'),
    hi: transliterateToIndicScript(productName, 'hi'),
    ta: transliterateToIndicScript(productName, 'ta'),
    kn: transliterateToIndicScript(productName, 'kn'),
    te: transliterateToIndicScript(productName, 'te'),
    profile: null,
  };
}
