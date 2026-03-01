import React from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import SEO from '../components/SEO';
import { FaBook, FaHome, FaQuestionCircle, FaComment, FaEnvelope, FaPenFancy, FaUserCog } from 'react-icons/fa';

const KullanimKilavuzuPage = () => {
    return (
        <MainLayout showMobileFooter={true}>
            <SEO title="Kullanım Kılavuzu - Herkesler Soruyor" description="Sitede soru sorma, cevap yazma, mesajlaşma ve tüm özelliklerin kullanım rehberi." />
            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-coral to-orange-400 rounded-full mb-4 shadow-lg">
                        <FaBook className="text-white text-2xl" />
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">
                        Kullanım Kılavuzu
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400">
                        Soru sormaktan mesajlaşmaya kadar tüm adımlar
                    </p>
                </div>

                <div className="space-y-6">
                    <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-coral/20 rounded-lg flex items-center justify-center">
                                <FaHome className="text-coral" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Ana sayfa ve gezinme</h2>
                        </div>
                        <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-3">
                            Giriş yaptıktan sonra ana sayfada kategorilere göre listelenen soruları görürsünüz. Üstteki arama çubuğu ile soru veya anahtar kelime arayabilirsiniz. Menüden <strong>Ana Sayfa</strong>, <strong>Liderlik Tablosu</strong>, <strong>Benceler</strong> ve <strong>Mesajlar</strong> sayfalarına geçiş yapabilirsiniz. Mobilde alt menü (Bottom Nav) ile ana sayfa, soru sor, mesajlar ve profil erişiminiz vardır.
                        </p>
                    </section>

                    <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-coral/20 rounded-lg flex items-center justify-center">
                                <FaQuestionCircle className="text-coral" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Soru nasıl sorulur?</h2>
                        </div>
                        <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-3">
                            <Link to="/ask" className="text-coral font-semibold hover:underline">Soru Sor</Link> sayfasına menüden veya &quot;Soru Sor&quot; butonundan ulaşabilirsiniz. Adımlar:
                        </p>
                        <ul className="space-y-2 mb-4">
                            <li className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                <span className="w-2 h-2 rounded-full bg-coral flex-shrink-0 mt-1.5" />
                                <strong>Kategori:</strong> Sorunun konusuna uygun kategoriyi seçin (örn. İlişkiler, Moda, Teknoloji).
                            </li>
                            <li className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                <span className="w-2 h-2 rounded-full bg-coral flex-shrink-0 mt-1.5" />
                                <strong>Başlık:</strong> Sorunuzu kısa ve net bir başlıkla yazın. Örn: &quot;Yaz düğünü için hangi renk abiye önerirsiniz?&quot;
                            </li>
                            <li className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                <span className="w-2 h-2 rounded-full bg-coral flex-shrink-0 mt-1.5" />
                                <strong>Açıklama:</strong> İsterseniz detaylı açıklama ekleyebilirsiniz. Metin editörü ile kalın, italik, liste ve resim ekleyebilirsiniz. Kullanıcı etiketlemek için <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-sm">@kullanıcıadı</code> yazın.
                            </li>
                            <li className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                <span className="w-2 h-2 rounded-full bg-coral flex-shrink-0 mt-1.5" />
                                <strong>Etiketler:</strong> En fazla 5 etiket ekleyebilirsiniz. <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-sm">#etiket</code> formatında veya popüler etiketlerden seçebilirsiniz.
                            </li>
                            <li className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                <span className="w-2 h-2 rounded-full bg-coral flex-shrink-0 mt-1.5" />
                                <strong>Gizli üye:</strong> Soruyu anonim (gizli üye) olarak paylaşmak isterseniz ilgili kutucuğu işaretleyin; böylece adınız görünmez.
                            </li>
                            <li className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                <span className="w-2 h-2 rounded-full bg-coral flex-shrink-0 mt-1.5" />
                                <strong>Anket (opsiyonel):</strong> Evet/Hayır veya seçenekli anket ekleyebilirsiniz; bitiş süresini de belirleyebilirsiniz.
                            </li>
                        </ul>
                        <p className="text-gray-600 dark:text-gray-300 text-sm">
                            Formu doldurduktan sonra <strong>Gönder</strong> ile sorunuz yayınlanır.
                        </p>
                    </section>

                    <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-coral/20 rounded-lg flex items-center justify-center">
                                <FaComment className="text-coral" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Cevaplama ve yorumlar</h2>
                        </div>
                        <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-3">
                            Bir soruya tıklayarak detay sayfasına gidin. Burada:
                        </p>
                        <ul className="space-y-2 mb-3">
                            <li className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                <span className="w-2 h-2 rounded-full bg-coral flex-shrink-0 mt-1.5" />
                                <strong>Cevap yaz:</strong> Altta &quot;Cevabınızı buraya yazın&quot; alanına yazıp gönderin. Cevabı da gizli üye olarak verebilirsiniz.
                            </li>
                            <li className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                <span className="w-2 h-2 rounded-full bg-coral flex-shrink-0 mt-1.5" />
                                <strong>Soruya yorum:</strong> Sorunun altında &quot;Soruya yorum yazın&quot; ile doğrudan soruya yorum yapabilirsiniz.
                            </li>
                            <li className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                <span className="w-2 h-2 rounded-full bg-coral flex-shrink-0 mt-1.5" />
                                <strong>Cevaba yorum:</strong> Her cevabın altında &quot;Cevaba yorum yazın&quot; ile o cevaba yanıt verebilirsiniz.
                            </li>
                            <li className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                <span className="w-2 h-2 rounded-full bg-coral flex-shrink-0 mt-1.5" />
                                <strong>Yanıtla (reply):</strong> Bir yoruma &quot;Yanıtla&quot; diyerek alt yorum yazabilirsiniz; &quot;Diğer yanıtları gör&quot; ile daha fazla yanıt yüklenir.
                            </li>
                            <li className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                <span className="w-2 h-2 rounded-full bg-coral flex-shrink-0 mt-1.5" />
                                <strong>Beğeni:</strong> Kalp ikonu ile soru, cevap veya yorumu beğenebilirsiniz.
                            </li>
                        </ul>
                        <p className="text-gray-600 dark:text-gray-300 text-sm">
                            Yorum ve cevaplarda GIF ekleyebilir, <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-sm">@kullanıcıadı</code> ile etiketleme yapabilirsiniz.
                        </p>
                    </section>

                    <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-coral/20 rounded-lg flex items-center justify-center">
                                <FaEnvelope className="text-coral" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Mesajlar</h2>
                        </div>
                        <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-3">
                            <Link to="/messages" className="text-coral font-semibold hover:underline">Mesajlar</Link> sayfasından özel mesajlaşma yapabilirsiniz:
                        </p>
                        <ul className="space-y-2">
                            <li className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                <span className="w-2 h-2 rounded-full bg-coral flex-shrink-0 mt-1.5" />
                                Bir kullanıcının profil sayfasından <strong>Mesaj gönder</strong> ile sohbet başlatabilirsiniz; veya Mesajlar sayfasında arama ile kullanıcı bulup konuşma açabilirsiniz.
                            </li>
                            <li className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                <span className="w-2 h-2 rounded-full bg-coral flex-shrink-0 mt-1.5" />
                                Mesajlara metin, GIF veya resim ekleyebilirsiniz; mesajlara tepki (emoji) verebilir veya mesajı düzenleyebilirsiniz.
                            </li>
                            <li className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                <span className="w-2 h-2 rounded-full bg-coral flex-shrink-0 mt-1.5" />
                                Sohbeti gizleyebilir (şifre ile tekrar erişebilirsiniz) veya kullanıcıyı engelleyebilirsiniz.
                            </li>
                        </ul>
                    </section>

                    <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-coral/20 rounded-lg flex items-center justify-center">
                                <FaPenFancy className="text-coral" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Benceler (yazı yazma)</h2>
                        </div>
                        <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                            <Link to="/opinions" className="text-coral font-semibold hover:underline">Benceler</Link> bölümünde kullanıcılar konular hakkında uzun yazılar paylaşır. &quot;Yazı Yaz&quot; butonu ile <Link to="/opinions/yaz" className="text-coral font-semibold hover:underline">yeni bir görüş yazısı</Link> oluşturabilirsiniz. Başlık ve içerik girin; isterseniz yorumlara izin verip vermeyeceğinizi seçebilirsiniz. Yazılara da yorum yapıp beğenebilirsiniz.
                        </p>
                    </section>

                    <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-coral/20 rounded-lg flex items-center justify-center">
                                <FaUserCog className="text-coral" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Profil ve ayarlar</h2>
                        </div>
                        <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-3">
                            Sağ üstteki profil menüsünden kendi profilinize gidebilirsiniz. Profilde takipçi / takip edilen, sorularınız ve cevaplarınız görünür. <Link to="/settings" className="text-coral font-semibold hover:underline">Ayarlar</Link> sayfasından hesap bilgileri, bildirim tercihleri ve gizlilik ayarlarını güncelleyebilirsiniz.
                        </p>
                    </section>

                    <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-coral/20 rounded-lg flex items-center justify-center">
                                <FaBook className="text-coral" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Daha fazla yardım</h2>
                        </div>
                        <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                            <Link to="/yardim-merkezi" className="text-coral font-semibold hover:underline">Yardım Merkezi</Link> sayfasında hesap, soru-cevap ve güvenlik konularında kısa rehberlere ulaşabilirsiniz. Özel sorunuz için <Link to="/iletisim" className="text-coral font-semibold hover:underline">İletişim</Link> sayfasından bize yazabilirsiniz.
                        </p>
                    </section>
                </div>
            </div>
        </MainLayout>
    );
};

export default KullanimKilavuzuPage;
