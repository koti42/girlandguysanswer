import { FaHeart, FaTshirt, FaGamepad, FaUsers, FaMedal, FaUtensils, FaPlane } from 'react-icons/fa';

export const categories = [
    { id: 1, title: 'Aşk & İlişkiler', color: 'from-pink-500 to-rose-500', icon: FaHeart },
    { id: 2, title: 'Moda & Güzellik', color: 'from-amber-400 to-orange-500', icon: FaTshirt },
    { id: 3, title: 'Teknoloji & Oyun', color: 'from-slate-700 to-slate-900', icon: FaGamepad },
    { id: 4, title: 'Sağlık & Diyet', color: 'from-emerald-400 to-green-600', icon: FaUsers },
    { id: 5, title: 'Eğitim & Kariyer', color: 'from-blue-400 to-indigo-600', icon: FaMedal },
    { id: 6, title: 'Yemek & Tarif', color: 'from-red-400 to-pink-500', icon: FaUtensils },
    { id: 7, title: 'Seyahat & Keşif', color: 'from-cyan-400 to-blue-500', icon: FaPlane },
];

export const trends = [
    { id: 1, tag: '#rending', count: '3.5B' },
    { id: 2, tag: '#omisorel_konular', count: '4.2K' },
    { id: 3, tag: '#tavsiye_soru', count: '3.5B' },
    { id: 4, tag: '#resimlikatanyom', count: '2.7B' },
    { id: 5, tag: '#gundemdekiler', count: '1.8B' },
    { id: 6, tag: '#trending2026', count: '980K' },
];

export const topUsers = [
    { id: 1, name: 'Top Üzerler', avatar: 'https://i.pravatar.cc/150?u=1', rank: 'gold' },
    { id: 2, name: 'Top Demir', avatar: 'https://i.pravatar.cc/150?u=2', rank: 'silver' },
    { id: 3, name: 'Top User', avatar: 'https://i.pravatar.cc/150?u=3', rank: 'bronze' },
];

export const notifications = [
    { id: 1, type: 'like', user: 'Ahmet_K', message: 'sorunuzu beğendi', time: '5 dk önce', read: false },
    { id: 2, type: 'comment', user: 'Elif_M', message: 'sorunuza yorum yaptı', time: '12 dk önce', read: false },
    { id: 3, type: 'follow', user: 'Can_Yilmaz', message: 'seni takip etmeye başladı', time: '1 saat önce', read: true },
    { id: 4, type: 'badge', user: 'Sistem', message: 'Yeni rozet kazandınız: Fenomen!', time: '2 saat önce', read: true },
    { id: 5, type: 'like', user: 'Selin_A', message: 'yorumunuzu beğendi', time: '3 saat önce', read: true },
];

export const questions = [
    {
        id: 1,
        user: {
            name: 'Zeynep_Yildiz',
            gender: 'female',
            avatar: 'https://i.pravatar.cc/150?u=4',
            badge: null
        },
        category: 'Moda & Güzellik',
        title: 'Bu yaz düğün sezonu için abiye elbise önerileriniz neler? Hangi renkler moda?',
        tags: ['#düğünkombini', '#abiye'],
        image: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&q=80',
        stats: {
            likes: 245,
            comments: 68,
            views: '3.5B'
        },
        isPopular: true
    },
    {
        id: 2,
        user: {
            name: 'Berk_Demir',
            gender: 'male',
            avatar: 'https://i.pravatar.cc/150?u=5',
            badge: 'fenomen'
        },
        category: 'Aşk & İlişkiler',
        title: 'Kız arkadaşımla ilk yıl dönümümüz yaklaşıyor. Ona unutulmaz bir sürpriz yapmak istiyorum, ne önerirsiniz?',
        tags: ['#yıldönümü', '#sürpriz'],
        image: 'https://images.unsplash.com/photo-1517263904808-5dc8b43b1c2f?w=800&q=80',
        stats: {
            likes: 180,
            comments: 42,
            views: '2.1B'
        },
        isPopular: true
    },
    {
        id: 3,
        user: {
            name: 'Ayse_Kara',
            gender: 'female',
            avatar: 'https://i.pravatar.cc/150?u=6',
            badge: null
        },
        category: 'Sağlık & Diyet',
        title: 'Sabah kahvaltısında hangi besinleri tercih etmeliyim? Sağlıklı beslenme önerileriniz var mı?',
        tags: ['#kahvaltı', '#sağlıklıbeslenme'],
        image: null,
        stats: {
            likes: 92,
            comments: 31,
            views: '1.2B'
        },
        isPopular: false
    },
    {
        id: 4,
        user: {
            name: 'Mehmet_A',
            gender: 'male',
            avatar: 'https://i.pravatar.cc/150?u=7',
            badge: 'fenomen'
        },
        category: 'Teknoloji & Oyun',
        title: 'Yeni bilgisayar topluyorum, oyun için en iyi ekran kartı hangisi? Bütçem 20bin TL civarında.',
        tags: ['#ekrankarti', '#gaming', '#pcsetup'],
        image: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=800&q=80',
        stats: {
            likes: 156,
            comments: 89,
            views: '4.2B'
        },
        isPopular: true
    },
    {
        id: 5,
        user: {
            name: 'Selin_Oz',
            gender: 'female',
            avatar: 'https://i.pravatar.cc/150?u=8',
            badge: null
        },
        category: 'Eğitim & Kariyer',
        title: 'Yeni mezun oldum ve iş arıyorum. CV\'de dikkat edilmesi gereken en önemli noktalar neler?',
        tags: ['#cv', '#isariyorum', '#kariyer'],
        image: null,
        stats: {
            likes: 203,
            comments: 57,
            views: '2.8B'
        },
        isPopular: true
    },
    {
        id: 6,
        user: {
            name: 'Can_Yilmaz',
            gender: 'male',
            avatar: 'https://i.pravatar.cc/150?u=9',
            badge: null
        },
        category: 'Yemek & Tarif',
        title: 'Evde pizza yapmayı deniyorum ama hamur tutmuyor. Sizin denenmiş tarifleriniz var mı?',
        tags: ['#pizza', '#yemektarifi', '#evyemegi'],
        image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80',
        stats: {
            likes: 128,
            comments: 45,
            views: '1.9B'
        },
        isPopular: false
    },
    {
        id: 7,
        user: {
            name: 'Elif_Mavi',
            gender: 'female',
            avatar: 'https://i.pravatar.cc/150?u=10',
            badge: null
        },
        category: 'Seyahat & Keşif',
        title: 'İzmir çevresinde hafta sonu gezilecek en güzel yerler neresi? Deniz kenarı tercihim.',
        tags: ['#izmir', '#gezi', '#haftasonu'],
        image: 'https://images.unsplash.com/photo-1527004013197-933c4bb611b3?w=800&q=80',
        stats: {
            likes: 174,
            comments: 62,
            views: '2.4B'
        },
        isPopular: true
    },
    {
        id: 8,
        user: {
            name: 'Ahmet_K',
            gender: 'male',
            avatar: 'https://i.pravatar.cc/150?u=11',
            badge: 'fenomen'
        },
        category: 'Aşk & İlişkiler',
        title: 'Uzun mesafe ilişkisi yaşayan var mı? Deneyimlerinizi paylaşır mısınız?',
        tags: ['#uzakmesafe', '#iliski'],
        image: null,
        stats: {
            likes: 267,
            comments: 103,
            views: '5.1B'
        },
        isPopular: true
    },
    {
        id: 9,
        user: {
            name: 'Deniz_S',
            gender: 'female',
            avatar: 'https://i.pravatar.cc/150?u=12',
            badge: null
        },
        category: 'Moda & Güzellik',
        title: 'Kuru ve mat saçlar için hangi bakım ürünlerini önerirsiniz? Doğal çözümler de olabilir.',
        tags: ['#saçbakımı', '#güzellik'],
        image: null,
        stats: {
            likes: 89,
            comments: 34,
            views: '1.5B'
        },
        isPopular: false
    },
    {
        id: 10,
        user: {
            name: 'Emre_T',
            gender: 'male',
            avatar: 'https://i.pravatar.cc/150?u=13',
            badge: null
        },
        category: 'Teknoloji & Oyun',
        title: 'iPhone\'dan Android\'e geçmeyi düşünüyorum. Deneyimi olan var mı? Pişman olur muyum?',
        tags: ['#android', '#iphone', '#telefon'],
        image: null,
        stats: {
            likes: 312,
            comments: 127,
            views: '6.3B'
        },
        isPopular: true
    },
    {
        id: 11,
        user: {
            name: 'Gizem_Y',
            gender: 'female',
            avatar: 'https://i.pravatar.cc/150?u=14',
            badge: null
        },
        category: 'Sağlık & Diyet',
        title: 'Spor salonuna yeni başladım. Protein tozu kullanmak gerekli mi yoksa gereksiz mi?',
        tags: ['#spor', '#protein', '#fitness'],
        image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80',
        stats: {
            likes: 145,
            comments: 51,
            views: '2.2B'
        },
        isPopular: false
    },
    {
        id: 12,
        user: {
            name: 'Hakan_D',
            gender: 'male',
            avatar: 'https://i.pravatar.cc/150?u=15',
            badge: 'fenomen'
        },
        category: 'Eğitim & Kariyer',
        title: 'Yurtdışında master yapmayı planlıyorum. Burs başvuru süreçleri hakkında bilgi verebilir misiniz?',
        tags: ['#master', '#yurtdışı', '#burs'],
        image: null,
        stats: {
            likes: 198,
            comments: 76,
            views: '3.4B'
        },
        isPopular: true
    }
];
