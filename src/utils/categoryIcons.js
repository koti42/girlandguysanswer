import { 
    FaHeart,
    FaHome,
    FaShoppingBag,
    FaCar,
    FaStar,
    FaSpa,
    FaFire,
    FaBaby,
    FaEllipsisH,
    FaAppleAlt,
    FaFilm,
    FaGraduationCap,
    FaCouch,
    FaPaw,
    FaGamepad,
    FaNewspaper,
    FaGem,
    FaLaptop,
    FaUser,
    FaFemale,
    FaPaintBrush,
    FaMask,
    FaTshirt,
    FaMusic,
    FaDollarSign,
    FaLeaf,
    FaHeartbeat,
    FaRunning,
    FaPlane,
    FaUtensils
} from 'react-icons/fa';

/**
 * API'den gelen kategorilere göre icon seçimi
 */
export const getCategoryIcon = (categoryName) => {
    if (!categoryName) return FaHome;
    
    const lowerName = categoryName.toLowerCase().trim();
    
    const iconMap = {
        'aile & toplum': FaHome,
        'alışveriş & hediyeler': FaShoppingBag,
        'arabalar': FaCar,
        'aşk ilişkileri': FaHeart,
        'aşk i̇lişkileri': FaHeart,
        'astroloji & burçlar': FaStar,
        'cilt bakım': FaSpa,
        'cinsel yaşam': FaFire,
        'çocuk & ebeveyn': FaBaby,
        'diğer': FaEllipsisH,
        'diyet & beslenme': FaAppleAlt,
        'diziler & filmler': FaFilm,
        'eğitim & kariyer': FaGraduationCap,
        'ev & yaşam': FaCouch,
        'evcil hayvanlar': FaPaw,
        'gamer': FaGamepad,
        'gündem': FaNewspaper,
        'güzellik & bakım': FaGem,
        'i̇nternet & teknoloji': FaLaptop,
        'internet & teknoloji': FaLaptop,
        'kişilik & karakter': FaUser,
        'kızlar bir adım öne': FaFemale,
        'kültür & sanat': FaPaintBrush,
        'magazin': FaMask,
        'moda & stil': FaTshirt,
        'müzik & etkinlik': FaMusic,
        'para & ekonomi': FaDollarSign,
        'saç bakım': FaLeaf,
        'sağlık': FaHeartbeat,
        'spor': FaRunning,
        'tatil & seyahat': FaPlane,
        'yeme & i̇çme': FaUtensils,
        'yeme & içme': FaUtensils,
    };

    return iconMap[lowerName] || FaHome;
};


export const getCategoryColor = (categoryColor) => {
    if (categoryColor && categoryColor.startsWith('#')) {
        return categoryColor;
    }
    
    return '#9E9E9E'; 
};


export const getCategoryHexColor = (categoryName) => {
    if (!categoryName) return '#6B7280';
    
    const lowerName = categoryName.toLowerCase();
    
    const hexColorMap = {
        'aşk & ilişkiler': '#EC4899',
        'moda & güzellik': '#FB923C',
        'teknoloji & oyun': '#1E293B',
        'sağlık & diyet': '#10B981',
        'eğitim & kariyer': '#3B82F6',
        'yemek & tarif': '#EF4444',
        'seyahat & keşif': '#06B6D4',
        'kitap & edebiyat': '#A855F7',
        'spor & fitness': '#F97316',
        'müzik & sanat': '#D946EF',
        'film & dizi': '#A855F7',
        'hobi & sanat': '#FBBF24',
    };

    if (hexColorMap[lowerName]) {
        return hexColorMap[lowerName];
    }

    if (lowerName.includes('aşk') || lowerName.includes('ilişki') || lowerName.includes('sevgi')) return '#EC4899';
    if (lowerName.includes('moda') || lowerName.includes('güzellik') || lowerName.includes('style')) return '#FB923C';
    if (lowerName.includes('teknoloji') || lowerName.includes('oyun') || lowerName.includes('game')) return '#1E293B';
    if (lowerName.includes('sağlık') || lowerName.includes('diyet') || lowerName.includes('beslen')) return '#10B981';
    if (lowerName.includes('eğitim') || lowerName.includes('kariyer') || lowerName.includes('iş')) return '#3B82F6';
    if (lowerName.includes('yemek') || lowerName.includes('tarif') || lowerName.includes('food')) return '#EF4444';
    if (lowerName.includes('seyahat') || lowerName.includes('keşif') || lowerName.includes('travel')) return '#06B6D4';
    if (lowerName.includes('kitap') || lowerName.includes('edebiyat') || lowerName.includes('book')) return '#A855F7';
    if (lowerName.includes('spor') || lowerName.includes('fitness') || lowerName.includes('sport')) return '#F97316';
    if (lowerName.includes('müzik') || lowerName.includes('sanat') || lowerName.includes('music')) return '#D946EF';
    if (lowerName.includes('film') || lowerName.includes('dizi') || lowerName.includes('series')) return '#A855F7';
    if (lowerName.includes('hobi') || lowerName.includes('craft')) return '#FBBF24';

    return '#6B7280';
};
