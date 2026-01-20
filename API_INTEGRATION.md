# 📚 Nested Yorumlar - Frontend Kullanım Kılavuzu

## 🎯 Nested Yorum Yapısı

API artık yorumları **nested (iç içe)** yapıda döndürüyor. Ana yorumlar `parent_id: null` olan yorumlardır ve her ana yorumun altında `replies` array'i bulunur.

---

## 📋 API Response Yapısı

### Soru Detayı Response

```json
{
  "success": true,
  "data": {
    "question": {
      "id": "...",
      "title": "...",
      "comments": [
        {
          "id": "comment-1-id",
          "content": "Ana yorum 1",
          "parent_id": null,
          "user": {
            "id": "...",
            "username": "Elif_Mavi",
            "avatar": "..."
          },
          "isOwner": true,
          "canEdit": true,
          "canDelete": true,
          "created_at": "...",
          "replies": [
            {
              "id": "reply-1-id",
              "content": "Yoruma cevap 1",
              "parent_id": "comment-1-id",
              "user": {
                "id": "...",
                "username": "Ahmet_Yilmaz",
                "avatar": "..."
              },
              "isOwner": false,
              "canEdit": false,
              "canDelete": false,
              "created_at": "..."
            }
          ]
        },
        {
          "id": "comment-2-id",
          "content": "Ana yorum 2",
          "parent_id": null,
          "user": {...},
          "replies": []
        }
      ]
    },
    "answers": [...]
  }
}
```

### Önemli Alanlar

| Alan | Açıklama |
|------|----------|
| `parent_id` | `null` ise ana yorum, değer varsa cevaptır |
| `replies` | Ana yoruma gelen cevapların array'i |
| `isOwner` | Giriş yapan kullanıcının yorumu mu? |
| `canEdit` | Kullanıcı bu yorumu düzenleyebilir mi? |
| `canDelete` | Kullanıcı bu yorumu silebilir mi? |
| `user` | Yorum sahibinin bilgileri (username, avatar, vb.) |

---

## 🔧 React Component Örneği

### 2. Comment List Component

```jsx
import React, { useState } from 'react';

const CommentsList = ({ questionId, comments, onCommentAdded }) => {
  const [newCommentText, setNewCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Ana yorum ekle
  const handleAddComment = async (e) => {
    e.preventDefault();
    
    if (!newCommentText.trim()) return;

    setIsSubmitting(true);
    
    try {
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch('http://127.0.0.1:8003/api/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          content: newCommentText,
          commentable_type: 'question',
          commentable_id: questionId
          // parent_id YOK - Ana yorum
        })
      });

      const data = await response.json();

      if (data.success) {
        // Yeni yorumu replies: [] ile ekle
        onCommentAdded({
          ...data.data.comment,
          replies: []
        });
        setNewCommentText('');
      } else {
        alert('Hata: ' + data.message);
      }
    } catch (error) {
      alert('Bağlantı hatası: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Yoruma cevap ekle
  const handleReplyToComment = async (parentCommentId, replyText) => {
    try {
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch('http://127.0.0.1:8003/api/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          content: replyText,
          commentable_type: 'question',
          commentable_id: questionId,
          parent_id: parentCommentId  // Parent comment ID
        })
      });

      const data = await response.json();

      if (data.success) {
        // Parent comment'e reply ekle
        onCommentAdded(data.data.comment, parentCommentId);
      } else {
        alert('Hata: ' + data.message);
      }
    } catch (error) {
      alert('Bağlantı hatası: ' + error.message);
    }
  };

  return (
    <div className="comments-section">
      <h3>Yorumlar ({comments.length})</h3>

      {/* Ana Yorum Formu */}
      <form onSubmit={handleAddComment} className="add-comment-form">
        <textarea
          value={newCommentText}
          onChange={(e) => setNewCommentText(e.target.value)}
          placeholder="Yorumunuzu yazın..."
          maxLength={1000}
          required
        />
        <button 
          type="submit" 
          disabled={isSubmitting || !newCommentText.trim()}
        >
          {isSubmitting ? 'Gönderiliyor...' : 'Yorum Yap'}
        </button>
      </form>

      {/* Yorumlar Listesi */}
      <div className="comments-list">
        {comments.length === 0 ? (
          <p className="no-comments">Henüz yorum yapılmamış. İlk yorumu siz yapın!</p>
        ) : (
          comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onReply={handleReplyToComment}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default CommentsList;
```

---

## 🧪 Kullanım Akışı

### 1. Sayfa Yüklendiğinde

```javascript
// Soru detayını çek (yorumlar nested gelir)
GET /api/questions/{slug}

// Response:
{
  "success": true,
  "data": {
    "question": {
      "comments": [
        // Ana yorumlar (parent_id: null)
        {
          "id": "...",
          "replies": [
            // Cevaplar
          ]
        }
      ]
    }
  }
}
```

### 3. Kullanıcı Yoruma Cevap Yazdığında

```javascript
// Yoruma cevap ekle
POST /api/comments
{
  "content": "Cevap içeriği",
  "commentable_type": "question",
  "commentable_id": "question-id",
  "parent_id": "parent-comment-id"  // ÖNEMLİ!
}
```
