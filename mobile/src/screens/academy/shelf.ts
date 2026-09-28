/** The Academy's world shelf: free public-domain books from every part of the world, each checked
 *  to open on Project Gutenberg with its [query]. Reading them never costs an AI call. */

export type Region = 'Africa' | 'Asia' | 'Middle East' | 'Europe' | 'Americas' | 'Oceania';
export type Subject = 'Literature' | 'Philosophy' | 'Science' | 'Maths' | 'History' | 'Poetry' | 'Young readers';

export interface ShelfBook {
  title: string;
  author: string;
  query: string;
  region: Region;
  origin: string; // where it comes from, in a word or two
  subjects: Subject[];
  blurb: string;
  note?: string;
}

export const REGIONS: Region[] = ['Africa', 'Asia', 'Middle East', 'Europe', 'Americas', 'Oceania'];
export const SUBJECTS: Subject[] = ['Literature', 'Philosophy', 'Science', 'Maths', 'History', 'Poetry', 'Young readers'];

export const SHELF: ShelfBook[] = [
  // Africa
  { title: 'The Interesting Narrative', author: 'Olaudah Equiano', query: 'Interesting Narrative Equiano', region: 'Africa', origin: 'Igboland', subjects: ['History', 'Literature'], blurb: 'Kidnapped as a child, freed by his own hand: the memoir that helped end the slave trade.' },
  { title: 'The Story of an African Farm', author: 'Olive Schreiner', query: 'Story of an African Farm Schreiner', region: 'Africa', origin: 'South Africa', subjects: ['Literature'], blurb: 'Three children grow up on the Karoo and question everything they are told.' },
  // Asia
  { title: 'The Art of War', author: 'Sun Tzu', query: 'Art of War Sun Tzu', region: 'Asia', origin: 'China', subjects: ['Philosophy', 'History'], blurb: 'Thirteen short chapters on strategy, still read by generals, coaches and founders.' },
  { title: 'Tao Te Ching', author: 'Laozi', query: 'Tao Te Ching', region: 'Asia', origin: 'China', subjects: ['Philosophy', 'Poetry'], blurb: 'Eighty-one tiny poems about yielding, balance and the way of things.' },
  { title: 'The Analects', author: 'Confucius', query: 'Analects Confucius', region: 'Asia', origin: 'China', subjects: ['Philosophy'], blurb: 'Sayings on learning, kindness and good government that shaped East Asia.' },
  { title: 'Gitanjali', author: 'Rabindranath Tagore', query: 'Gitanjali Tagore', region: 'Asia', origin: 'Bengal', subjects: ['Poetry'], blurb: 'Song offerings that won Asia its first Nobel Prize in Literature.' },
  { title: 'The Book of Tea', author: 'Kakuzo Okakura', query: 'Book of Tea Okakura', region: 'Asia', origin: 'Japan', subjects: ['Philosophy', 'History'], blurb: 'How a cup of tea became an art, a philosophy and a way of seeing.' },
  { title: 'Bushido, the Soul of Japan', author: 'Inazo Nitobe', query: 'Bushido Nitobe', region: 'Asia', origin: 'Japan', subjects: ['History', 'Philosophy'], blurb: 'The samurai code explained to the world by a Japanese educator.' },
  { title: 'The Jungle Book', author: 'Rudyard Kipling', query: 'Jungle Book Kipling', region: 'Asia', origin: 'India', subjects: ['Young readers', 'Literature'], blurb: 'Mowgli, raised by wolves, taught by a bear and a panther.' },
  // Middle East
  { title: 'The Rubaiyat', author: 'Omar Khayyam', query: 'Rubaiyat of Omar Khayyam', region: 'Middle East', origin: 'Persia', subjects: ['Poetry'], blurb: 'Quatrains by the astronomer-poet on time, wine and wonder.' },
  { title: 'The Thousand and One Nights', author: 'Various', query: 'Arabian Nights Entertainments', region: 'Middle East', origin: 'Arabia · Persia', subjects: ['Literature', 'Young readers'], blurb: 'Scheherazade tells a story every night to stay alive: Sinbad, Aladdin and more.' },
  { title: 'The Prophet', author: 'Kahlil Gibran', query: 'The Prophet Gibran', region: 'Middle East', origin: 'Lebanon', subjects: ['Poetry', 'Philosophy'], blurb: 'A departing sage speaks on love, work, children, freedom and joy.' },
  // Europe
  { title: 'Meditations', author: 'Marcus Aurelius', query: 'Meditations Marcus Aurelius', region: 'Europe', origin: 'Rome', subjects: ['Philosophy'], blurb: 'An emperor’s private notes to himself on staying calm and doing good.' },
  { title: 'The Odyssey', author: 'Homer', query: 'Odyssey Homer', region: 'Europe', origin: 'Greece', subjects: ['Literature', 'Poetry'], blurb: 'Ten years at sea, one clever hero, and the long way home.' },
  { title: 'Don Quixote', author: 'Miguel de Cervantes', query: 'Don Quixote', region: 'Europe', origin: 'Spain', subjects: ['Literature'], blurb: 'A man reads too many adventure books and rides out to become one.' },
  { title: 'Pride and Prejudice', author: 'Jane Austen', query: 'Pride and Prejudice', region: 'Europe', origin: 'England', subjects: ['Literature'], blurb: 'First impressions, second thoughts, and the sharpest dialogue in English.' },
  { title: 'Crime and Punishment', author: 'Fyodor Dostoyevsky', query: 'Crime and Punishment', region: 'Europe', origin: 'Russia', subjects: ['Literature', 'Philosophy'], blurb: 'A student commits a murder and cannot escape his own mind.' },
  { title: 'Grimms’ Fairy Tales', author: 'The Brothers Grimm', query: 'Grimm Fairy Tales', region: 'Europe', origin: 'Germany', subjects: ['Young readers'], blurb: 'Cinderella, Rapunzel, Hansel and Gretel, as first written down.' },
  { title: 'Aesop’s Fables', author: 'Aesop', query: "Aesop's Fables", region: 'Europe', origin: 'Greece', subjects: ['Young readers', 'Philosophy'], blurb: 'The tortoise, the hare and two hundred other tiny lessons.' },
  { title: 'Alice in Wonderland', author: 'Lewis Carroll', query: "Alice's Adventures in Wonderland", region: 'Europe', origin: 'England', subjects: ['Young readers', 'Literature'], blurb: 'Down the rabbit hole, where logic goes to play.' },
  { title: 'History of the Peloponnesian War', author: 'Thucydides', query: 'Peloponnesian War Thucydides', region: 'Europe', origin: 'Athens', subjects: ['History'], blurb: 'The first history written to find out what really happened, and why.' },
  // Americas
  { title: 'Narrative of Frederick Douglass', author: 'Frederick Douglass', query: 'Narrative Frederick Douglass', region: 'Americas', origin: 'United States', subjects: ['History', 'Literature'], blurb: 'He taught himself to read, then wrote his way to freedom.' },
  { title: 'The Souls of Black Folk', author: 'W. E. B. Du Bois', query: 'Souls of Black Folk', region: 'Americas', origin: 'United States', subjects: ['History', 'Philosophy'], blurb: 'Essays that named “double consciousness” and changed a century.' },
  { title: 'Walden', author: 'Henry David Thoreau', query: 'Walden Thoreau', region: 'Americas', origin: 'United States', subjects: ['Philosophy'], blurb: 'Two years in a cabin by a pond, living simply on purpose.' },
  { title: 'Dom Casmurro', author: 'Machado de Assis', query: 'Dom Casmurro', region: 'Americas', origin: 'Brazil', subjects: ['Literature'], blurb: 'Brazil’s great unreliable narrator remembers his first love.', note: 'In Portuguese' },
  { title: 'Anne of Green Gables', author: 'L. M. Montgomery', query: 'Anne of Green Gables', region: 'Americas', origin: 'Canada', subjects: ['Young readers', 'Literature'], blurb: 'An orphan with a big imagination arrives where no one expected her.' },
  { title: 'Autobiography', author: 'Benjamin Franklin', query: 'Autobiography of Benjamin Franklin', region: 'Americas', origin: 'United States', subjects: ['History'], blurb: 'A printer’s apprentice becomes a scientist, inventor and statesman.' },
  // Oceania
  { title: 'The Man from Snowy River', author: 'A. B. Paterson', query: 'Man from Snowy River', region: 'Oceania', origin: 'Australia', subjects: ['Poetry'], blurb: 'Galloping bush ballads from the Australian high country.' },
  { title: 'For the Term of His Natural Life', author: 'Marcus Clarke', query: 'For the Term of His Natural Life', region: 'Oceania', origin: 'Australia', subjects: ['Literature', 'History'], blurb: 'A wrongly convicted man survives the penal colonies.' },
  // science & maths (from everywhere)
  { title: 'On the Origin of Species', author: 'Charles Darwin', query: 'Origin of Species Darwin', region: 'Europe', origin: 'England', subjects: ['Science'], blurb: 'The idea that explains every living thing, argued step by step.' },
  { title: 'Relativity', author: 'Albert Einstein', query: 'Relativity Einstein', region: 'Europe', origin: 'Germany', subjects: ['Science', 'Maths'], blurb: 'Einstein explains his own theory, for readers without advanced maths.' },
  { title: 'The Chemical History of a Candle', author: 'Michael Faraday', query: 'Chemical History of a Candle', region: 'Europe', origin: 'England', subjects: ['Science', 'Young readers'], blurb: 'Six lectures for young people: all of chemistry, from one flame.' },
  { title: 'Calculus Made Easy', author: 'Silvanus P. Thompson', query: 'Calculus Made Easy', region: 'Europe', origin: 'England', subjects: ['Maths'], blurb: '“What one fool can do, another can.” Calculus without fear.' },
  { title: 'Flatland', author: 'Edwin A. Abbott', query: 'Flatland', region: 'Europe', origin: 'England', subjects: ['Maths', 'Literature'], blurb: 'A square who lives in two dimensions meets a sphere.' },
  { title: 'Elements of Euclid', author: 'Euclid', query: 'Elements of Euclid', region: 'Africa', origin: 'Alexandria', subjects: ['Maths'], blurb: 'Geometry from first principles, written in Alexandria 2,300 years ago.' },
];

/** "Welcome, scholar" around the world, for the Academy's gate. */
export const WELCOMES: [string, string][] = [
  ['Welcome, scholar', 'English'],
  ['Karibu, mwanafunzi', 'Swahili'],
  ['Ẹ kú àbọ̀, akẹ́kọ̀ọ́', 'Yoruba'],
  ['Bienvenue, étudiant·e', 'French'],
  ['Bienvenido, estudiante', 'Spanish'],
  ['Bem-vindo, estudante', 'Portuguese'],
  ['أهلاً بك يا طالب العلم', 'Arabic'],
  ['स्वागत है, विद्यार्थी', 'Hindi'],
  ['欢迎你，学者', 'Chinese'],
  ['ようこそ、学び手', 'Japanese'],
  ['환영합니다, 학생', 'Korean'],
  ['Hoş geldin, öğrenci', 'Turkish'],
  ['Добро пожаловать', 'Russian'],
  ['Selamat datang, pelajar', 'Malay'],
  ['Nnọọ, nwa akwụkwọ', 'Igbo'],
  ['Barka da zuwa, ɗalibi', 'Hausa'],
];
