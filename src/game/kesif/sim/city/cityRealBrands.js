/*
 * KEŞİF sim/city — GERÇEK marka / oyun / stüdyo / karakter / kişi adları (saf veri).
 *
 * Neon Meridyen'de (şehir sözleşmesi §2) hiçbir gerçek ad kullanılamaz. Bu liste:
 *  - `scanText` (citySafeData.js) ile tarayıcıda metinleri denetler,
 *  - `cityBrands` benzerlik (düzenleme uzaklığı) testinde 60 özgün dükkân adını gerçeklerle karşılaştırır.
 * Biçim: düz dizge = gerçek ad. Kesme işareti ve tire ad parçasıdır ("McDonald's", "Spider-Man"); tarayıcı
 * boşluk/tire/kesme işaretini yok sayar, Türkçe harfleri katlar. `AMBIGUOUS_BRANDS` yaygın sözcük olanlardır:
 * yalnızca BÜYÜK harfle başlayan yazımda ("Steam", "Apple") isabet sayılır.
 * Bu dosya taramada izinli listededir (kendisi yasak adları içerir).
 */

/** Araçlar ve motosikletler. */
export const BRANDS_VEHICLE = [
  'Toyota', 'Honda', 'Ford', 'Fiat', 'Renault', 'Peugeot', 'Citroen', 'Opel', 'Volkswagen', 'Mercedes',
  'Mercedes-Benz', 'BMW', 'Audi', 'Porsche', 'Ferrari', 'Lamborghini', 'Tesla', 'Hyundai', 'Kia', 'Nissan',
  'Mazda', 'Subaru', 'Suzuki', 'Skoda', 'Seat', 'Volvo', 'Jaguar', 'Bentley', 'Maserati', 'Bugatti',
  'McLaren', 'Chevrolet', 'Dodge', 'Jeep', 'Cadillac', 'Lexus', 'Mitsubishi', 'Dacia', 'Togg', 'Tofaş',
  'Karsan', 'Otokar', 'Ducati', 'Yamaha', 'Kawasaki', 'Harley-Davidson', 'Vespa', 'Aston Martin',
  'Rolls-Royce', 'Land Rover', 'Range Rover', 'Alfa Romeo', 'Pagani', 'Koenigsegg', 'Lotus', 'DeLorean',
  'Mondial', 'Bajaj',
];

/** Teknoloji, yazılım, platform, elektronik. */
export const BRANDS_TECH = [
  'Apple', 'iPhone', 'iPad', 'MacBook', 'Google', 'Android', 'Chrome', 'Microsoft', 'Windows', 'Xbox',
  'Samsung', 'Galaxy', 'Sony', 'PlayStation', 'Nokia', 'Huawei', 'Xiaomi', 'Oppo', 'OnePlus', 'Intel',
  'Nvidia', 'AMD', 'Qualcomm', 'Amazon', 'Alexa', 'Facebook', 'Meta', 'Instagram', 'WhatsApp', 'Twitter',
  'TikTok', 'Snapchat', 'YouTube', 'Netflix', 'Spotify', 'Oracle', 'IBM', 'Dell', 'Lenovo', 'ASUS', 'Acer',
  'Logitech', 'Razer', 'Cisco', 'Adobe', 'Photoshop', 'Uber', 'Airbnb', 'PayPal', 'Visa', 'Mastercard',
  'Discord', 'Telegram', 'Zoom', 'Skype', 'Twitch', 'Reddit', 'Pinterest', 'LinkedIn', 'Shazam', 'GoPro',
  'Canon', 'Nikon', 'Fujifilm', 'Philips', 'Siemens', 'Bosch', 'Panasonic', 'Toshiba', 'Casio', 'Garmin',
  'Fitbit', 'Dyson', 'Arçelik', 'Beko', 'Vestel', 'Teknosa', 'Turkcell', 'Vodafone', 'Türk Telekom',
  'Hepsiburada', 'Trendyol', 'Yemeksepeti', 'Getir', 'Sahibinden', 'Papara', 'Aselsan', 'Baykar',
  'Gmail', 'Outlook', 'Safari', 'Firefox', 'Linux', 'Ubuntu', 'ChatGPT', 'OpenAI', 'Wikipedia',
];

/** Yiyecek, içecek, market ve mağaza zincirleri. */
export const BRANDS_FOOD = [
  'Coca-Cola', 'Pepsi', 'Fanta', 'Sprite', 'Red Bull', 'Monster Energy', "McDonald's", 'Burger King', 'KFC',
  'Starbucks', 'Subway', "Domino's", 'Pizza Hut', "Papa John's", 'Nutella', 'Oreo', 'Snickers', 'Twix',
  'Mars', 'Kinder', 'Milka', 'Haribo', "Lay's", 'Doritos', 'Pringles', 'Cheetos', 'Nestlé', 'Nescafé',
  'Danone', 'Lipton', 'Heinz', "Kellogg's", 'Ülker', 'Eti', 'Torku', 'Pınar', 'Sütaş', 'Tat', 'Dimes',
  'Cappy', 'Uludağ', 'Cola Turka', 'Simit Sarayı', 'Kahve Dünyası', 'Mado', 'Köfteci Yusuf', 'Popeyes',
  'Tchibo', 'Lindt', 'Toblerone', 'Ferrero', 'Maltesers', 'Skittles', 'Nesquik', 'Gatorade',
  'Mountain Dew', 'Schweppes', 'Algida', 'Magnum', 'Cornetto', 'Carrefour', 'Migros', 'BİM', 'A101', 'ŞOK',
  'Tesco', 'Walmart', 'Lidl', 'Aldi', 'IKEA', 'Watsons', 'Gratis', 'Rossmann', 'Kipa', 'Macrocenter',
  'Hayat Su', 'Erikli', 'Beypazarı', 'Namet', 'Banvit', 'Sırma', 'Damla Su',
];

/** Giyim, ayakkabı, aksesuar, lüks. */
export const BRANDS_FASHION = [
  'Nike', 'Adidas', 'Puma', 'Reebok', 'New Balance', 'Converse', 'Vans', 'Under Armour', 'The North Face',
  'Timberland', 'Zara', 'Uniqlo', 'Mango', 'Gucci', 'Prada', 'Chanel', 'Louis Vuitton', 'Dior', 'Versace',
  'Armani', 'Burberry', 'Hermès', 'Balenciaga', "Levi's", 'Lacoste', 'Ralph Lauren', 'Tommy Hilfiger',
  'Calvin Klein', 'Rolex', 'Ray-Ban', 'Oakley', 'Swatch', 'Fossil', 'Pandora', 'Tiffany', 'Cartier', 'Koton',
  'LC Waikiki', 'DeFacto', 'Mavi', 'Beymen', 'Vakko', 'Boyner', 'Penti', "Colin's", 'Hummel', 'Skechers',
  'Crocs', 'Birkenstock', 'Decathlon', 'Columbia', 'Patagonia', 'Fila', 'Kappa', 'Umbro', 'Asics',
  'Salomon', 'Speedo', 'Esprit', 'Benetton', 'Diesel', 'Guess', 'Superdry', 'Bershka', 'Pull&Bear',
  'Stradivarius', 'Massimo Dutti', 'Primark', 'Gap', 'Flormar', 'Lumberjack', 'Kinetix', 'Altınyıldız',
];

/** Video oyunları ve oyun serileri. */
export const BRANDS_GAME = [
  'Minecraft', 'Fortnite', 'Roblox', 'Pokémon', 'Pikachu', 'Super Mario', 'Mario Kart', 'Zelda', 'Sonic',
  'Pac-Man', 'Tetris', 'Among Us', 'FIFA', 'PUBG', 'Valorant', 'League of Legends', 'World of Warcraft',
  'Warcraft', 'Overwatch', 'Halo', 'Doom', 'Skyrim', 'Fallout', 'The Witcher', 'Cyberpunk',
  'Grand Theft Auto', 'GTA', 'Red Dead', 'Call of Duty', 'Counter-Strike', 'Apex Legends', 'Terraria',
  'Stardew Valley', 'Fall Guys', 'Genshin Impact', 'Candy Crush', 'Clash of Clans', 'Clash Royale',
  'Brawl Stars', 'Subway Surfers', 'Temple Run', 'Angry Birds', 'Animal Crossing', 'Kirby', 'Metroid',
  'Street Fighter', 'Mortal Kombat', 'Tekken', "Assassin's Creed", 'Far Cry', 'Diablo', 'StarCraft',
  'Hearthstone', 'Rocket League', 'Undertale', 'Half-Life', 'Left 4 Dead', 'Resident Evil', 'Silent Hill',
  'Final Fantasy', 'Dragon Quest', 'Kingdom Hearts', 'Elden Ring', 'Dark Souls', 'Bloodborne', 'God of War',
  'Uncharted', 'The Last of Us', 'Mobile Legends', 'Free Fire', 'Gacha Life', 'Toca Boca', 'Hay Day',
  'SimCity', 'The Sims', 'Cities Skylines', 'Need for Speed', 'Forza', 'Gran Turismo', 'Luigi', 'Bowser',
  'Donkey Kong', 'Yoshi', 'Splatoon', 'Smash Bros', 'Wordle', 'Geometry Dash', 'Cuphead', 'Hollow Knight',
  'Mass Effect', 'Baldur\'s Gate', 'Borderlands', 'Bioshock', 'Portal 2',
];

/** §2'de adı geçen Cyberpunk 2077 evreni (oyun, şirket, karakter, yer, öğe adları). */
export const BRANDS_UNIVERSE = [
  'Cyberpunk 2077', 'Night City', 'Arasaka', 'Militech', 'CD Projekt Red', 'Johnny Silverhand', 'Silverhand', 'Delamain',
  'Braindance', 'NCPD', 'Kiroshi', 'Afterlife', 'Johnny', 'Netrunner', 'Cyberpsycho', 'Edgerunners', 'Soulkiller',
  'Mikoshi', 'Blackwall', 'Kang Tao', 'Biotechnica', 'Trauma Team', 'Tyger Claws', 'Voodoo Boys', 'Dogtown',
  'Adam Smasher', 'Judy Alvarez', 'Panam Palmer', 'Jackie Welles', 'Kerry Eurodyne', 'Takemura', 'Yorinobu',
];

/** Oyun/film/yayın stüdyoları, konsol ve oyuncak markaları. */
export const BRANDS_STUDIO = [
  'Nintendo', 'Sega', 'Atari', 'Ubisoft', 'Activision', 'Blizzard', 'Epic Games', 'Valve', 'Steam', 'Mojang',
  'Bethesda', 'Capcom', 'Konami', 'Bandai Namco', 'Square Enix', 'Rockstar', 'Naughty Dog', 'CD Projekt',
  'EA Sports', 'Electronic Arts', 'Riot Games', 'Supercell', 'Niantic', 'Zynga', 'Disney', 'Pixar',
  'Marvel', 'DC Comics', 'Warner Bros', 'DreamWorks', 'Studio Ghibli', 'Ghibli', 'Paramount', 'Lucasfilm',
  'Hasbro', 'Mattel', 'Barbie', 'Hot Wheels', 'Playmobil', 'Lego', 'Funko', 'Cartoon Network', 'Nickelodeon',
  'HBO', 'Hulu', 'Crunchyroll', 'Sanrio', 'TRT Çocuk', 'Cartoon Saloon', 'Illumination', 'Sony Pictures',
];

/** Kurgusal karakterler ve seriler. */
export const BRANDS_CHARACTER = [
  'Batman', 'Superman', 'Spider-Man', 'Iron Man', 'Hulk', 'Captain America', 'Wonder Woman',
  'Joker', 'Harry Potter', 'Hogwarts', 'Gandalf', 'Frodo', 'Hobbit', 'Darth Vader', 'Yoda', 'Star Wars',
  'Star Trek', 'Mickey Mouse', 'Minnie Mouse', 'Donald Duck', 'Goofy', 'Elsa', 'Frozen', 'Shrek', 'Simpsons',
  'Homer Simpson', 'SpongeBob', 'Peppa Pig', 'Paw Patrol', 'Bluey', 'Doraemon', 'Naruto', 'Goku',
  'Dragon Ball', 'One Piece', 'Kratos', 'Master Chief', 'Lara Croft', 'Sailor Moon', 'Totoro',
  'Winnie the Pooh', 'Tom and Jerry', 'Bugs Bunny', 'Scooby-Doo', 'Garfield', 'Snoopy', 'Minions',
  'Despicable Me', 'Toy Story', 'Buzz Lightyear', 'Moana', 'Simba', 'Aladdin', 'Cinderella', 'Teletubbies',
  'Rafadan Tayfa', 'Kral Şakir', 'Pepee', 'Niloya', 'Hello Kitty', 'Pocoyo', 'Ben 10', 'Transformers',
  'Optimus Prime', 'Thanos', 'Deadpool', 'Wolverine', 'Black Panther', 'Avengers', 'Pennywise', 'Chucky',
];

/** Gerçek kişiler (ünlüler, iş insanları, sporcular). */
export const BRANDS_PERSON = [
  'Elon Musk', 'Mark Zuckerberg', 'Bill Gates', 'Steve Jobs', 'Jeff Bezos', 'Messi', 'Ronaldo', 'Neymar',
  'Mbappe', 'Taylor Swift', 'Michael Jackson', 'Beyonce', 'Eminem', 'Kylie Jenner', 'MrBeast', 'PewDiePie',
];

/**
 * Faz 5 (safety_audit): ek film / dizi / anime / oyun / siber-punk türü eserleri, ek marka ve gerçek kişiler
 * (Türk ve dünya ünlüleri, siyasetçiler, içerik üreticileri, sporcular). Gerçek kişi adı şehirde HİÇBİR biçimde kullanılamaz.
 */
export const BRANDS_MORE = [
  // siber-punk türü eserler ve oyunlar
  'Blade Runner', 'Tron', 'The Matrix', 'Matrix Reloaded', 'Akira', 'Ghost in the Shell', 'Neuromancer', 'Ready Player One', 'Black Mirror',
  'Altered Carbon', 'Deus Ex', 'Shadowrun', 'Watch Dogs', "Mirror's Edge", 'Nite City', 'Neo Tokyo', 'Cyber City', 'Mega City One',
  'Judge Dredd', 'RoboCop', 'Terminator', 'Westworld', 'Mario', 'Luigi Mansion', 'Talking Tom', 'Plants vs Zombies', 'Hill Climb Racing',
  'Crossy Road', 'Fruit Ninja', 'Cut the Rope', 'My Talking Angela', 'Brawlhalla', 'Rainbow Six', 'Battlefield',
  'Game Boy', 'Nintendo Switch', 'Wii', 'Dreamcast', 'Tamagotchi', 'Pokeball', 'Beyblade', 'Yu-Gi-Oh', 'Magic the Gathering',
  'Squid Game', 'Stranger Things', 'Game of Thrones', 'Breaking Bad', 'Lord of the Rings', 'Jurassic Park', 'Indiana Jones', 'James Bond',
  'Fast and Furious', 'Mission Impossible', 'Kung Fu Panda', 'Ice Age', 'Cars Lightning McQueen', 'Lightning McQueen', 'Finding Nemo', 'Lion King',
  // ek marka / hizmet
  'Tavuk Dünyası', 'Komagene', 'Çiğköfteci Ali Usta', 'Bursa Kebap', 'Hacı Bekir', 'Koçtaş', 'Bauhaus', 'Mediamarkt', 'Vatan Bilgisayar',
  'N11', 'Çiçeksepeti', 'Amazon Prime', 'Disney Plus', 'Exxen', 'BluTV', 'Banuba', 'Shopee', 'AliExpress', 'Temu', 'Shein',
  'Lamborghini Aventador', 'Ford Mustang', 'Chevrolet Camaro', 'Nissan GTR', 'Toyota Supra', 'Honda Civic', 'Mini Cooper', 'Fiat Egea',
  'Renault Clio', 'Corvette', 'Camaro', 'Lambo',
  // gerçek kişiler: Türkiye
  'Atatürk', 'Mustafa Kemal', 'Mustafa Kemal Atatürk', 'Erdoğan', 'Recep Tayyip', 'Kılıçdaroğlu',
  'Sezen Aksu', 'Kemal Sunal', 'Barış Manço', 'Cem Yılmaz', 'Tarkan Tevetoğlu', 'Ajda Pekkan', 'Sertab Erener', 'Kenan Doğulu', 'Burak Özçivit',
  'Kıvanç Tatlıtuğ', 'Haluk Bilginer', 'Müslüm Gürses', 'İbrahim Tatlıses', 'Orhan Gencebay', 'Zeki Müren', 'Cüneyt Arkın', 'Türkan Şoray',
  'Sıla Gençoğlu', 'Mabel Matiz', 'Reynmen', 'Enes Batur', 'Murat Övüç', 'Danla Bilic', 'Ruhi Çenet', 'Orkun Işıtmak',
  'Jahrein', 'Elraenn', 'Wtcn', 'Technoruk', 'Pqueen', 'Arda Güler', 'Hakan Şükür', 'Hakan Çalhanoğlu', 'Cüneyt Çakır', 'Naim Süleymanoğlu',
  'Mesut Özil', 'Emre Belözoğlu', 'Aziz Sancar', 'Cahit Arf', 'Oktay Sinanoğlu',
  // gerçek kişiler: dünya
  'Cristiano Ronaldo', 'Lionel Messi', 'Kylian Mbappe', 'LeBron James', 'Michael Jordan', 'Kobe Bryant', 'Serena Williams', 'Usain Bolt',
  'Donald Trump', 'Trump', 'Joe Biden', 'Obama', 'Putin', 'Zelensky', 'Angela Merkel', 'Macron', 'Kim Jong', 'Hitler', 'Napoleon',
  'Justin Bieber', 'Selena Gomez', 'Ariana Grande', 'Billie Eilish', 'Dua Lipa', 'Katy Perry', 'Lady Gaga', 'Rihanna', 'Shakira',
  'Ed Sheeran', 'BTS', 'Blackpink', 'One Direction', 'Beatles', 'Elvis Presley', 'Madonna', 'Britney Spears', 'Kanye West',
  'Tom Cruise', 'Brad Pitt', 'Leonardo DiCaprio', 'Johnny Depp', 'Keanu Reeves', 'Robert Downey', 'Dwayne Johnson', 'Will Smith', 'Jackie Chan',
  'Bruce Lee', 'Albert Einstein', 'Isaac Newton', 'Nikola Tesla', 'Stephen Hawking', 'Sam Altman', 'Jensen Huang', 'Sergey Brin',
  'Satya Nadella', 'Sundar Pichai', 'Tim Cook', 'Warren Buffett', 'Mark Cuban', 'Linus Torvalds', 'Greta Thunberg', 'Malala',
];

/** Tüm gerçek adlar (yinelenen yok). */
export const REAL_BRANDS = Object.freeze(Array.from(new Set([
  ...BRANDS_VEHICLE, ...BRANDS_TECH, ...BRANDS_FOOD, ...BRANDS_FASHION, ...BRANDS_GAME, ...BRANDS_STUDIO,
  ...BRANDS_CHARACTER, ...BRANDS_PERSON, ...BRANDS_UNIVERSE, ...BRANDS_MORE,
])));

/**
 * Bilinen Türkçe/İngilizce yaygın sözcükle aynı yazılan gerçek adlar (Mavi = mavi renk, Tat = lezzet, Mars = gezegen):
 * metin taramasında YOK SAYILIR (ad/renk/yer adı olarak serbest), yalnızca dükkân adı benzerlik denetimine
 * (`findBrandCollision`) girer: özgün dükkân adı bu sözcüklerden birini taşıyamaz.
 */
export const COMMON_WORD_BRANDS = Object.freeze([
  'Mavi', 'Tat', 'Eti', 'Gratis', 'Kinder', 'Pınar', 'Mars', 'ŞOK', 'Gap', 'Guess', 'Fossil', 'Diesel', 'Seat', 'Getir',
  'Visa', 'Meta', 'Zoom', 'Galaxy', 'Chrome', 'Windows', 'Halo', 'Doom', 'Frozen', 'Joker', 'Magnum', 'Sprite',
]);

/**
 * Yaygın sözcük olan (ya da kısa) adlar: tarayıcı bunlara yalnızca BÜYÜK harfle başlayan yazımda
 * ("Steam", "Apple") isabet verir; "steam" parçacık anahtarı gibi küçük harfli kod dizgeleri geçer.
 */
export const AMBIGUOUS_BRANDS = Object.freeze([
  'Apple', 'Android', 'Chrome', 'Windows', 'Galaxy', 'Meta', 'Oracle', 'Amazon', 'Zoom', 'Reddit', 'Twitch',
  'Discord', 'Alexa', 'Canon', 'Shazam', 'Visa', 'Safari', 'Linux', 'Ford', 'Jaguar', 'Seat', 'Lotus', 'Dodge',
  'Jeep', 'Mars', 'Subway', 'Tat', 'Eti', 'Pınar', 'ŞOK', 'Gratis', 'Kinder', 'Magnum', 'Mado', 'Tesco',
  'Puma', 'Mango', 'Gap', 'Guess', 'Diesel', 'Fossil', 'Mavi', 'Columbia', 'Kappa', 'Penti', 'Doom', 'Halo',
  'Fallout', 'Valve', 'Steam', 'Marvel', 'Paramount', 'Joker', 'Frozen', 'Goofy', 'Aladdin', 'Cinderella',
  'Hobbit', 'Elsa', 'Simba', 'Blizzard', 'Rockstar', 'Sega', 'Kia', 'Bosch', 'Dell', 'Acer', 'Sony', 'Mercedes',
  'Gmail', 'Outlook', 'Firefox', 'Uber', 'Sprite', 'Monster Energy', 'Beko', 'BİM', 'A101', 'Sırma', 'Namet',
  'Erikli', 'Sonic', 'Kirby', 'Forza', 'Diablo', 'Wordle', 'Uncharted', 'Hades', 'Portal 2', 'Hot Wheels',
  'Frodo', 'Hulk', 'Thor', 'Goku', 'Naruto', 'Moana', 'Bluey', 'Pocoyo', 'Mondial', 'Bajaj', 'Elden Ring',
  'Dark Souls', 'Skechers', 'Crocs', 'Fila', 'Umbro', 'Esprit', 'Hummel', 'Lumberjack', 'Kinetix',
  'Tron', 'Akira', 'Mario', 'Wii', 'Temu', 'Shein', 'Obama', 'Trump', 'Napoleon',
  'Matrix Reloaded', 'Battlefield', 'Terminator', 'Westworld', 'Madonna', 'Shakira', 'Rihanna', 'Corvette', 'Camaro', 'Beatles',
  'Mini Cooper', 'Ice Age', 'Lion King', 'Putin', 'Macron', 'Game Boy', 'Beyblade',
]);
