'use strict';
// Starting content for the website. After first launch, everything here is
// edited from the admin page (#admin) and saved in the data folder.

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const photo = (id, w = 1400) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=75`;

// Stock photos to start with. Replace each one with your own photo in admin.
const ITEM_PHOTOS = {
  'Blueberry Cheese Cake': '1533134242443-d4fd215305ad', 'Strawberry Cheese Cake': '1565958011703-44f9829ba187',
  'Chocolate Cheese Cake': '1578985545062-69928b1d9587', 'Coconut Snow White Cheese Cake': '1535141192574-5d4897c12636',
  'Original Cheese Cake': '1524351199678-941a58a3df50', 'Coconut Cream Cake': '1588195538326-c5b1e9f80a1b',
  'Dark Chocolate Truffle Cake': '1606890737304-57a1ca8a5b62', 'Black Forest Cake': '1606313564200-e75d5e30476c',
  'White Forest Cake': '1542826438-bd32f43d626f', 'Red Velvet Cake': '1586788680434-30d324b2d46f',
  'Butterscotch Cake': '1571115177098-24ec42ed204d', 'Muffin (Cup Cake)': '1558961363-fa8fdf82db35', Cookie: '1499636136210-6f4ee915583e',
  Espresso: '1510591509098-f4fdc6d0ff04', Cappuccino: '1534778101976-62847782c213', Americano: '1551030173-122aabc4489c',
  'Cafe Latte': '1570968915860-54d5c301fa9f', Doppio: '1514432324607-a09d9b4aefdd', 'Long Black': '1497935586351-b67a49e012bf',
  'Iced Americano': '1517701550927-30cf4ba1dba5', 'Iced Latte': '1461023058943-07fcbe16d735', 'Iced Cappuccino': '1572490122747-3968b75cc699',
  'Iced Mocha': '1578314675249-a6910f80cc4e', 'Pick Me Double Shot on Ice': '1509042239860-f550ce710b93',
  'Virgin Mojito': '1513558161293-cdaf765ed2fd', 'Shirley Temple': '1551024709-8f23befc6f87', 'Virgin Pina Colada': '1546171753-97d7676e4602',
  'Virgin Daiquiri': '1560512823-829485b8bf24', Cinderella: '1536935338788-846bb9981813', 'Virgin Bellini': '1563223771-5fe4038fbfc9',
  'Virgin Margarita': '1514362545857-3bc16c4c7d1b', 'Blue Lagoon': '1560512823-829485b8bf24',
  'Chocolate Milkshake': '1572490122747-3968b75cc699', 'Strawberry Milkshake': '1579954115545-a95591f28bfc', 'Blueberry Milkshake': '1553177595-4de2bb0842b9',
  'Matcha Latte': '1536256263959-770b48d82b0a', 'Strawberry Matcha Latte': '1515823064-d6e0c04616a7', 'Blueberry Matcha Latte': '1536256263959-770b48d82b0a',
  'Iced Cherry Chai Latte': '1576092768241-dec231879fc3', 'Hot Chocolate': '1542990253-0d0f5be5f0ed', 'Hot Milk': '1550583724-b2692b85b150',
  'Jasmine Tea': '1576092768241-dec231879fc3', 'Green Tea': '1627435601361-ec25f5b1d0e5', 'Black Tea': '1594631252845-29fc4cc8cde9', Water: '1548839140-29a749e1cf4d',
  'Hot Dog (Chicken)': '1619740455993-9e612b1af08a', 'Hot Dog (Veg)': '1619740455993-9e612b1af08a',
  'Sandwich (Chicken)': '1528735602780-2552fd46c7af', 'Sandwich (Veg)': '1528735602780-2552fd46c7af',
  Brownie: '1606313564200-e75d5e30476c', 'Brownie with Icecream': '1563805042-7684c019e1cb', Vanilla: '1570197788417-0e82375c9371',
  Chocolate: '1563805042-7684c019e1cb',
};
const GROUP_PHOTOS = { tea: '1561336313-0bd5e0b27ec8', ramen: '1569718212165-3a8278d5f624', 'ice-cream': '1497034825429-c343d7c6a68f' };

function cat(name, note, rows) {
  const id = slug(name);
  return {
    id, name, note,
    items: rows.map(([itemName, prices, extra]) => {
      const pid = ITEM_PHOTOS[itemName] || GROUP_PHOTOS[id];
      return {
        id: `${id}-${slug(itemName)}`,
        name: itemName,
        desc: '',
        badge: '',
        image: pid ? photo(pid, 600) : '',
        available: true,
        tags: [],
        prices,
        ...(extra || {}),
      };
    }),
  };
}
const one = (p) => [{ label: '', price: p }];
const two = (a, b, la = 'Regular', lb = 'Large') => [{ label: la, price: a }, { label: lb, price: b }];
const cake = (slice, pound, half, size = '1 Pound') => [
  { label: 'Slice', price: slice },
  ...(half ? [{ label: 'Half Pound', price: half, whole: true }] : []),
  { label: size, price: pound, whole: true },
];
// Every whole cheesecake is one and a half pounds.
const cheese = (slice, price) => cake(slice, price, 0, '1½ Pound');

module.exports = {
  brand: {
    name: 'Pick Me Cafe',
    shortName: 'Pick Me',
    logo: '/img/logo.png',
    tagline: 'Coffee • Cakes • Icecream',
    address: 'Sigreni, Hetauda-12, Makawanpur, Nepal',
    phone: '9811847040',
    whatsapp: '9779811847040',
    open: '07:00',
    close: '19:00',
    hoursText: '7 AM to 7 PM, every day',
  },
  theme: {
    bg: '#FBF6EE',
    surface: '#FFFDF9',
    ink: '#3B2A1A',
    muted: '#6F5B48',
    accent: '#8C6A2E',
    gold: '#C4A265',
    fontDisplay: 'Marcellus',
    fontScript: 'Allura',
    fontBody: 'Jost',
    button: '#8C6A2E',
    radius: 18,
    headingScale: 1,
    bodySize: 16,
    width: 1180,
    heroHeight: 760,
    blend: true,
    animations: true,
    sectionGap: 56,
    border: 'gold',
  },
  sections: [
    { id: 'hero', label: 'Home', show: true, nav: true },
    { id: 'highlights', label: 'Specialities', show: true, nav: false },
    { id: 'events', label: 'Events', show: true, nav: false },
    // place: 'page' = its own page (/menu, /cake, /gallery), 'home' = on the home page, 'both'.
    { id: 'menu', label: 'Menu', show: true, nav: true, place: 'page' },
    { id: 'cake', label: 'Order a Cake', show: true, nav: true, place: 'page' },
    { id: 'booking', label: 'Book a Table', show: true, nav: true },
    { id: 'story', label: 'Our Story', show: true, nav: true },
    { id: 'gallery', label: 'Gallery', show: true, nav: true, place: 'page' },
    { id: 'moments', label: 'Guest moments', show: true, nav: false, place: 'page' },
    { id: 'reviews', label: 'Reviews', show: true, nav: true },
    { id: 'visit', label: 'Visit', show: true, nav: true },
  ],
  hero: {
    script: 'Welcome to',
    title: 'Pick Me Cafe',
    line: 'Coffee • Cheesecake • Mocktails',
    tagline: 'Little moments, beautiful memories.',
    button: 'Explore Our Menu',
    button2: 'Book a Table',
    button3: 'Order a Cake',
    card: { show: true, image: photo('1533134242443-d4fd215305ad', 300), label: 'House speciality', title: 'Cheesecake', text: 'By the slice, or pre-order a whole one' },
    image: photo('1554118811-1e0d58224f24', 1800),
    layout: 'right',
    marquee: 'Fresh espresso • Baked cheesecake • Handmade mocktails • Ice cream • Celebration cakes',
  },
  highlights: {
    script: 'What we do best',
    title: 'Three things we are known for',
    cards: [
      { title: 'Coffee', text: 'Espresso, cappuccino and iced coffee, made to order.', image: photo('1509042239860-f550ce710b93', 900), category: 'hot-coffee' },
      { title: 'Cheesecake', text: 'Blueberry, strawberry, chocolate and coconut snow white.', image: photo('1533134242443-d4fd215305ad', 900), category: 'cheesecake' },
      { title: 'Mocktails', text: 'Virgin mojito, blue lagoon, pina colada and more.', image: photo('1513558161293-cdaf765ed2fd', 900), category: 'mocktails' },
    ],
  },
  events: {
    script: 'Happening at Pick Me',
    title: 'Events & specials',
    seconds: 5,
    // Where the photo starts, in % of the box width from the left edge (computers). 0 = the photo fills the whole box.
    photoStart: 0,
    items: [
      {
        id: 'christmas-week', template: 'christmas', enabled: true, tag: 'Christmas Week', title: 'Christmas theme cakes',
        text: 'Our Christmas cakes and drinks arrive for Christmas Week, 19 to 25 December. Pre-order your cake now.',
        image: photo('1512389142860-9c449e58a543', 1600), button: 'See the Christmas specials', link: '', start: '2026-11-17', days: 39,
        message: 'Choose your Christmas cake, tell us the name to write on it, and grab it on the day.',
        menuTitle: 'Christmas specials',
        photos: [],
        menu: [],
      },
      {
        id: 'christmas-tables', template: '', enabled: true, tag: 'Christmas Week', title: 'Celebrate with friends',
        text: 'Book a table for your group, and tell us the cake and decoration you want ready when you arrive.',
        image: photo('1513558161293-cdaf765ed2fd', 1600), button: 'Book a table', link: '#booking', start: '2026-11-17', days: 39,
        message: '', menuTitle: '', photos: [], menu: [],
      },
    ],
  },
  // Days to plan themed cakes for. The admin page reminds you before each one.
  // rule: fixed = same English date every year (md MM-DD); bs = same Nepali date (md MM-DD);
  // nth = nth weekday of a month (month 1-12, weekday 0=Sunday, n); dates = changes every year, so list the dates.
  eventTemplates: [
    { key: 'christmas', name: 'Christmas', rule: 'fixed', md: '12-25', remind: 14, before: 7, tag: 'Christmas Week', title: 'Christmas theme cakes', text: 'Christmas cakes, cookies and winter drinks for the season.', message: 'Choose your Christmas cake and grab it on the day.' },
    { key: 'new-year', name: 'English New Year', rule: 'fixed', md: '01-01', remind: 14, before: 5, tag: 'New Year', title: 'New Year party cakes', text: 'Welcome the new year with a cake to share.', message: 'Pick your New Year cake and we will have it ready.' },
    { key: 'valentine', name: "Valentine's Day", rule: 'fixed', md: '02-14', remind: 14, before: 7, tag: "Valentine's Day", title: "Valentine's cakes for two", text: 'Heart cakes, red velvet and drinks for two.', message: 'Choose a cake for someone special and write their name on it.' },
    { key: 'womens-day', name: "Women's Day", rule: 'fixed', md: '03-08', remind: 14, before: 4, tag: "Women's Day", title: "Women's Day specials", text: 'A treat for the women who inspire us.', message: 'Pick a cake or a box of cookies to say thank you.' },
    { key: 'holi', name: 'Holi', rule: 'dates', dates: '2027-03-21', usual: 'March', remind: 14, before: 5, tag: 'Holi', title: 'Holi colour treats', text: 'Colourful cakes and cool drinks for Holi.', message: 'Grab a colourful cake for your Holi party.' },
    { key: 'nepali-new-year', name: 'Nepali New Year', rule: 'bs', md: '01-01', remind: 14, before: 7, tag: 'Naya Barsha', title: 'Nepali New Year cakes', text: 'Celebrate the new year with family and a cake.', message: 'Choose your New Year cake and we will have it ready.' },
    { key: 'mothers-day-nepal', name: "Mother's Day (Mata Tirtha Aunsi)", rule: 'dates', dates: '', usual: 'April or May', remind: 14, before: 7, tag: "Mother's Day", title: "Mother's Day cakes", text: 'Say thank you to your mother with her favourite cake.', message: 'Choose a cake for your mother and write her name on it.' },
    { key: 'mothers-day', name: "International Mother's Day", rule: 'nth', month: 5, weekday: 0, n: 2, remind: 14, before: 7, tag: "Mother's Day", title: "Mother's Day cakes", text: 'Say thank you to your mother with her favourite cake.', message: 'Choose a cake for your mother and write her name on it.' },
    { key: 'fathers-day', name: "International Father's Day", rule: 'nth', month: 6, weekday: 0, n: 3, remind: 14, before: 7, tag: "Father's Day", title: "Father's Day cakes", text: 'Special cakes and cookies for dad.', message: 'Choose your cake and grab it for dad.' },
    { key: 'teachers-day', name: "Teachers' Day (Guru Purnima)", rule: 'dates', dates: '', usual: 'July', remind: 14, before: 7, tag: "Teachers' Day", title: "Teachers' Day cakes", text: 'Thank your teachers with a cake from the whole class.', message: 'Order a cake for your teacher and we will write the message.' },
    { key: 'friendship-day', name: 'Friendship Day', rule: 'nth', month: 8, weekday: 0, n: 1, remind: 14, before: 5, tag: 'Friendship Day', title: 'Friendship Day treats', text: 'Bring your friends for cake and mocktails.', message: 'Pick a cake to share with your friends.' },
    { key: 'fathers-day-nepal', name: "Father's Day (Kushe Aunsi)", rule: 'dates', dates: '', usual: 'August or September', remind: 14, before: 7, tag: "Father's Day", title: "Father's Day cakes", text: 'Special cakes and cookies for dad.', message: 'Choose your cake and grab it for dad.' },
    { key: 'teej', name: 'Teej', rule: 'dates', dates: '', usual: 'August or September', remind: 14, before: 5, tag: 'Teej', title: 'Teej specials', text: 'Red velvet cakes and treats for Teej.', message: 'Choose your Teej cake and grab it on the day.' },
    { key: 'childrens-day', name: "Children's Day", rule: 'bs', md: '05-29', remind: 14, before: 5, tag: "Children's Day", title: "Children's Day treats", text: 'Fun cakes, cupcakes and ice cream for the kids.', message: 'Pick a cake the kids will love.' },
    { key: 'dashain', name: 'Dashain', rule: 'dates', dates: '', usual: 'September or October', remind: 21, before: 10, tag: 'Dashain', title: 'Dashain celebration cakes', text: 'Cakes for family gatherings this Dashain.', message: 'Order your Dashain cake early and pick it up on the day.' },
    { key: 'halloween', name: 'Halloween', rule: 'fixed', md: '10-31', remind: 14, before: 7, tag: 'Halloween', title: 'Spooky Halloween cakes', text: 'Pumpkin, chocolate and spooky cupcakes.', message: 'Choose your Halloween cake if you dare.' },
    { key: 'tihar', name: 'Tihar', rule: 'dates', dates: '', usual: 'October or November', remind: 21, before: 7, tag: 'Tihar', title: 'Tihar sweets and cakes', text: 'Cakes and sweet boxes for Bhai Tika and Laxmi Puja.', message: 'Choose your Tihar cake or sweet box and grab it on the day.' },
  ],
  menu: {
    script: 'Our Menu',
    title: 'Pick what you love',
    note: 'All prices in NPR. Delivery inside Hetauda costs Rs. 150 extra.',
    layout: 'list',
    // Small marks on items (veg, eggless...) and the search box above the tabs.
    marks: { show: true, filter: true },
    // On the menu page, show live events ("Happening at Pick Me") under the menu.
    showEvents: true,
    search: true,
    categories: [
      cat('Hot Coffee', '', [
        ['Espresso', two(140, 200, 'Single', 'Double')],
        ['Cappuccino', two(170, 220)],
        ['Americano', two(165, 215)],
        ['Cafe Latte', two(170, 230)],
        ['Doppio', one(220)],
        ['Long Black', two(150, 210)],
      ]),
      cat('Iced Coffee', '', [
        ['Iced Americano', two(175, 210)],
        ['Iced Latte', two(260, 300)],
        ['Iced Cappuccino', two(260, 300)],
        ['Iced Mocha', two(240, 290)],
        ['Pick Me Double Shot on Ice', two(230, 270), { badge: 'House special' }],
      ]),
      cat('Cheesecake', 'Whole cheesecakes need 8 hours notice.', [
        ['Blueberry Cheese Cake', cheese(270, 2600)],
        ['Strawberry Cheese Cake', cheese(270, 2600)],
        ['Chocolate Cheese Cake', cheese(280, 2600)],
        ['Coconut Snow White Cheese Cake', cheese(290, 2900)],
        ['Original Cheese Cake', cheese(250, 2500)],
      ]),
      cat('Mocktails', '', [
        ['Virgin Mojito', one(300)],
        ['Shirley Temple', one(440)],
        ['Virgin Pina Colada', one(495)],
        ['Virgin Daiquiri', one(500)],
        ['Cinderella', one(400)],
        ['Virgin Bellini', one(480)],
        ['Virgin Margarita', one(550)],
        ['Blue Lagoon', one(400)],
      ]),
      cat('Cakes & Pastries', 'Whole cakes need 8 hours notice.', [
        ['Coconut Cream Cake', cake(170, 1700)],
        ['Dark Chocolate Truffle Cake', cake(195, 1600)],
        ['Black Forest Cake', cake(120, 900, 650)],
        ['White Forest Cake', cake(130, 900, 650)],
        ['Red Velvet Cake', cake(170, 2000)],
        ['Butterscotch Cake', cake(170, 1800)],
        ['Muffin (Cup Cake)', one(100)],
        ['Cookie', one(20)],
      ]),
      cat('Shakes & Lattes', '', [
        ['Chocolate Milkshake', one(250)],
        ['Strawberry Milkshake', one(270)],
        ['Blueberry Milkshake', one(280)],
        ['Matcha Latte', one(385)],
        ['Strawberry Matcha Latte', one(390)],
        ['Blueberry Matcha Latte', one(395)],
        ['Iced Cherry Chai Latte', one(375)],
        ['Hot Chocolate', one(200)],
        ['Hot Milk', one(150)],
      ]),
      cat('Tea', '', [
        ['Jasmine Tea', one(120)],
        ['Regular Tea', one(50)],
        ['Masala Tea', one(100)],
        ['Green Tea', one(110)],
        ['Black Tea', one(40)],
        ['Hot Lemon + Honey', one(150)],
        ['Water', one(20)],
      ]),
      cat('Ice Cream', '', [
        ['Strawberry', one(180)],
        ['Butterscotch', one(140)],
        ['Brownie', one(220)],
        ['Brownie with Icecream', one(300)],
        ['Blueberry', one(180)],
        ['Chocolate', one(150)],
        ['Vanilla', one(165)],
        ['Caramel', one(170)],
        ['Oreo', one(180)],
        ['Chocolate Chip', one(180)],
        ['Coconut', one(185)],
        ['Cherry', one(200)],
        ['Imported Ice Cream of Choice', one(200)],
        ['21st Love', one(185)],
        ['Choco Bar', one(200)],
        ['Butter Bar', one(160)],
        ['Cup Ice-Cream', one(110)],
        ['Cookies and Cream', one(180)],
      ]),
      cat('Snacks', '', [
        ['Hot Dog (Chicken)', one(265), { tags: ['nonveg'] }],
        ['Hot Dog (Veg)', one(0), { available: false, tags: ['veg'] }],
        ['Sandwich (Chicken)', one(280), { tags: ['nonveg'] }],
        ['Sandwich (Veg)', one(250), { tags: ['veg'] }],
      ]),
      cat('Ramen', '', [
        ['Veg Ramen', one(290), { tags: ['veg'] }],
        ['Egg Ramen', one(360), { tags: ['nonveg'] }],
        ['Sausage Ramen', one(390), { tags: ['nonveg'] }],
        ['Mix Ramen', one(430), { tags: ['nonveg'] }],
      ]),
    ],
  },
  cake: {
    script: 'For your celebration',
    title: 'Order a cake for later',
    text: 'Birthday, anniversary or a surprise. Pick the cake, tell us the name to write on it, and choose when you want it.',
    image: photo('1464349095431-e9a21285b5f3', 1200),
    noticeHours: 8,
    button: 'Continue',
    // How many people one pound of cake serves, for the guide next to each size.
    // A photo for each cake (menu item id: photo). Empty means the cake's menu photo is used.
    photos: {},
    serveMin: 4,
    serveMax: 6,
    // Choices on a whole cake. Prices are per pound when "perPound" is on. Extra notice is in hours.
    options: [
      { id: 'candles', name: 'Candles and a cake knife', note: '', price: 0, perPound: false, notice: 0, show: true },
      { id: 'eggless', name: 'Eggless', note: '', price: 100, perPound: true, notice: 0, show: false },
      { id: 'sugarfree', name: 'Sugar-free', note: '', price: 100, perPound: true, notice: 0, show: false },
      { id: 'photo', name: 'Photo printed on top', note: 'Add your photo at the next step', price: 300, perPound: false, notice: 48, show: false },
    ],
  },
  booking: {
    script: 'Save your seat',
    title: 'Book a table',
    text: 'Choose a date and tell us how many people are coming. We will call or message you to confirm.',
    image: photo('1559925393-8be0ec4767c8', 1200),
    maxPeople: 30,
    seating: 'Main lounge, Quiet corner table, Celebration group table',
    button: 'Request booking',
  },
  story: {
    script: 'Our Story',
    title: 'Pick Me Cafe',
    text: 'A cosy place in Sigreni where coffee, cake and ice cream come together. Come to relax, to celebrate, or just for a slice of cheesecake.',
    side: 'Good Food, Good Mood',
    image: photo('1501339847302-ac426a4a7cbb', 1600),
  },
  gallery: {
    script: 'Our Gallery',
    title: '',
    images: [
      { image: photo('1495474472287-4d71bcdd2085', 900), caption: 'Morning coffee', tag: 'Coffee bar' },
      { image: photo('1578985545062-69928b1d9587', 900), caption: 'Celebration cakes', tag: 'Cakes' },
      { image: photo('1563805042-7684c019e1cb', 900), caption: 'Ice cream', tag: 'Ice cream' },
      { image: photo('1517248135467-4c7edcad34c4', 900), caption: 'Our space', tag: 'Sigreni' },
      { image: photo('1536935338788-846bb9981813', 900), caption: 'Mocktails', tag: 'Cold bar' },
    ],
  },
  // Albums of guest photos. Each shows from its date for a number of days, then hides itself.
  moments: {
    script: 'Guest moments',
    title: 'Smiles at Pick Me',
    text: 'Our guests, our favourite part of the day. Find yourself here.',
    privacy: 'Want a photo of you removed? Message us on WhatsApp and we will take it down.',
    albums: [],
  },
  reviews: {
    script: 'Kind words',
    title: 'What our guests say',
    formTitle: 'Leave a review',
    // In Google Business Profile, "Ask for reviews" gives a link that opens the review box. Paste it here.
    googleLink: '',
    googleAsk: 'Enjoyed it? A Google review helps a small cafe a lot.',
    googleButton: 'Review us on Google',
    rating: '',
    count: '',
    thanks: 'Thank you. Your review will appear here after we read it.',
  },
  visit: {
    script: 'Find us',
    title: 'Visit Pick Me Cafe',
    mapLink: 'https://maps.app.goo.gl/FLCbKPk2KrxUKMND6',
    mapEmbed: 'https://www.google.com/maps?q=27.415735,84.985909&z=17&output=embed',
    messageTitle: 'Send us a message',
    messageText: 'Your message opens in WhatsApp, so we can reply to you there.',
  },
  social: [
    { type: 'instagram', url: '', show: true },
    { type: 'facebook', url: '', show: true },
    { type: 'tiktok', url: '', show: true },
  ],
  // Choices customers can add to a drink (less sugar, extra shot...). Each set applies to the menu groups listed.
  extras: {
    show: true,
    title: 'Make it yours',
    groups: [
      { id: 'coffee', name: 'Coffee', categories: ['hot-coffee', 'iced-coffee'], show: true, options: [
        { id: 'less-sugar', name: 'Less sugar', price: 0, show: true },
        { id: 'no-sugar', name: 'No sugar', price: 0, show: true },
        { id: 'extra-shot', name: 'Extra shot', price: 60, show: false },
        { id: 'whipped-cream', name: 'Whipped cream', price: 50, show: false },
      ] },
      { id: 'cold', name: 'Cold drinks', categories: ['iced-coffee', 'mocktails', 'shakes-lattes'], show: true, options: [
        { id: 'less-ice', name: 'Less ice', price: 0, show: true },
        { id: 'no-ice', name: 'No ice', price: 0, show: true },
      ] },
      { id: 'tea', name: 'Tea', categories: ['tea'], show: true, options: [
        { id: 'less-sugar', name: 'Less sugar', price: 0, show: true },
        { id: 'no-sugar', name: 'No sugar', price: 0, show: true },
      ] },
    ],
  },
  // "Goes well with" suggestions in the cart: when the cart has something from the first group, suggest items from the second.
  upsell: {
    show: true,
    title: 'Goes well with your order',
    pairs: [
      { from: 'hot-coffee', to: 'cheesecake' },
      { from: 'iced-coffee', to: 'cheesecake' },
      { from: 'tea', to: 'cakes-pastries' },
      { from: 'mocktails', to: 'snacks' },
    ],
  },
  // What Google and link previews (WhatsApp, Facebook) show.
  seo: {
    title: 'Pick Me Cafe | Coffee, Cheesecake and Mocktails in Hetauda',
    description: 'Pick Me Cafe in Sigreni, Hetauda-12. Coffee, cheesecake, mocktails and ice cream. Order online, book a table or pre-order a cake. Open 7 AM to 7 PM every day.',
    image: '',
    city: 'Hetauda',
    region: 'Bagmati Province',
    lat: 27.415735,
    lng: 84.985909,
  },
  // The round buttons in the bottom corner of every page.
  socialBar: { show: true, whatsapp: true },
  // Shown when the cafe is closed for a day (or until a date).
  closure: {
    on: false,
    title: 'We are closed today',
    text: 'Sorry, the cafe is closed today. We will be back tomorrow at 7 AM.',
    image: '',
    until: '',
    allowLater: true,
  },
  payment: {
    deliveryFee: 150,
    deliveryNote: 'Delivery inside Hetauda only.',
    esewa: { enabled: true, name: 'eSewa', qr: '', account: '' },
    fonepay: { enabled: true, name: 'Fonepay', qr: '', account: '' },
    instructions: 'Scan the QR, pay the total, then upload a screenshot of the payment. You can also pay later at the counter or on delivery.',
  },
  footer: {
    line: 'Coffee. Cakes. Icecream.',
    note: '',
  },
  // Sizes set by dragging in admin ("Edit layout"), and photo positions and zoom.
  // Version 11: switches for the new parts, so any of them can be turned off from admin without a new version.
  features: { accounts: true, points: true, tableButtons: true, soldOut: true, liveStatus: true, orderAgain: true, googleSignIn: true, cod: true, mapPin: true, driverTracking: true },
  // Version 12: where the cafe is and how far it delivers (Hetauda only). The map pin must be inside the circle.
  delivery: { lat: 27.4287, lng: 85.0322, radiusKm: 9, note: 'We deliver inside Hetauda.' },
  // Loyalty points: a share of each finished order comes back as points (1 point = Rs. 1 by default).
  loyalty: {
    percent: 5, rupeesPerPoint: 1, minSpend: 50, expiryMonths: 12, birthdayPoints: 100, birthdayDays: 7,
    title: 'Pick Me points',
    text: 'Every order gives you 5% back as points. 1 point = Rs. 1 off a later order.',
  },
  // Customer accounts are optional: nobody needs one to order.
  accounts: {
    title: 'Your Pick Me account',
    text: 'Optional. Keep your orders and points on any phone, and order faster next time.',
  },
  // Buttons for guests who scanned the QR on their table.
  tableHelp: { show: true, wifiName: '', wifiPassword: '' },
  // "Get the app" card under the map.
  appCard: {
    show: true, title: 'Get the app', text: 'Order, follow your order and collect points from your phone.',
    qrText: 'Scan with your phone to get the Pick Me Cafe app',
    appStore: 'https://apps.apple.com/app/id6838835257', googlePlay: '', apk: '',
  },
  sizes: { map: { h: 240 } },
  crops: {},
  // The printable paper menu (Admin > Print menu). One A4 page. Items and prices come from the
  // website menu above (linked); this keeps only the paper's layout and looks.
  // Font sizes are in points (pt), spaces in millimetres (mm). Sections are filled in on first start.
  printMenu: {
    made: false,
    page: {
      paper: '#FFFFFF', top: 8, bottom: 7, left: 14, right: 12, gap: 9, split: 50,
      border: { show: false, width: 0.8, color: '#231F20', style: 'solid', inset: 6, radius: 0 },
      dots: { show: true, color: '#C9C9C9', size: 54, dot: 0.68, step: 1.9, tl: true, br: true },
      section: 4, afterHeading: 1, row: 0.55, priceWidth: 17, priceAlign: 'left', labelGap: 0.6, lineUp: true,
      headingLine: { show: false, width: 0.5, color: '#231F20', gap: 1 },
      rowLine: { show: false, width: 0.3, color: '#D9D4CC', style: 'dotted' },
      scale: 100,
    },
    logo: { show: true, src: '/img/print-logo.png', width: 35, color: '#231F20', gap: 5 },
    note: { text: '', show: false },
    styles: {
      big: { font: 'Rokkitt', weight: 800, size: 30, color: '#231F20', italic: false, upper: true, spacing: -1, line: 0.92 },
      bigSub: { font: 'Rokkitt', weight: 800, size: 9.5, color: '#231F20', italic: false, upper: true, spacing: 0, line: 1 },
      tagline: { font: 'Rokkitt', weight: 300, size: 13, color: '#231F20', italic: false, upper: true, spacing: 12, line: 1.1 },
      small: { font: 'Rokkitt', weight: 800, size: 11.5, color: '#231F20', italic: false, upper: true, spacing: 0, line: 1.1 },
      label: { font: 'Jost', weight: 400, size: 7.6, color: '#231F20', italic: false, upper: true, spacing: 0, line: 1.2 },
      item: { font: 'Jost', weight: 400, size: 8.2, color: '#231F20', italic: false, upper: true, spacing: 0, line: 1.25 },
      price: { font: 'Jost', weight: 400, size: 8.2, color: '#231F20', italic: false, upper: true, spacing: 0, line: 1.25 },
      note: { font: 'Jost', weight: 400, size: 7.5, color: '#231F20', italic: false, upper: false, spacing: 0, line: 1.3 },
    },
    over: {},
    sections: [],
  },
};
