# 📡 API Entegrasyon Bilgileri (Frontend İçin)

Frontend geliştirirken kullanacağınız temel endpointler aşağıdadır.
**Base URL**: `http://localhost:3000/api`

### Kimlik Doğrulama (Auth)

#### 1. Kayıt Ol (Register)
- **URL**: `POST /auth/register`
- **Body**:
  ```json
  {
    "username": "kullanici_adi",
    "email": "test@example.com",
    "password": "sifre123",
    "gender": "male"
  }
  ```
- **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Kullanıcı başarıyla oluşturuldu",
    "data": {
      "user": {
        "id": "c4d6ccde-58a4-45cf-ac8d-76382c817f54",
        "username": "kullanici_adi",
        "email": "test@example.com",
        "gender": "male",
        "createdAt": "2026-01-20T10:20:20.123+03:00"
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```

#### 2. Giriş Yap (Login)
- **URL**: `POST /auth/login`
- **Body**:
  ```json
  {
    "email": "test@example.com",
    "password": "sifre123"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Giriş başarılı",
    "data": {
      "user": {
        "id": "c4d6ccde-58a4-45cf-ac8d-76382c817f54",
        "username": "kullanici_adi",
        "email": "test@example.com",
        "gender": "male",
        "avatar": "https://i.pravatar.cc/150?u=1"
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```

### Sorular (Questions)

#### 3. Soruları Listele
- **URL**: `GET /questions`
- **Query Params**: `?page=1&limit=10&category=Moda`
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "questions": [
        {
          "id": "2a5bc6e7-8ae3-4c6a-9893-292332b00948",
          "title": "En iyi cilt bakım rutini nedir?",
          "description": "<p>Karma ciltler için...</p>",
          "category": "Cilt Bakımı",
          "tags": ["#ciltbakımı", "#güzellik"],
          "userId": "c4d6ccde...",
          "user": {
            "id": "c4d6ccde...",
            "username": "Zeynep_K",
            "gender": "female",
            "avatar": "https://i.pravatar.cc/150?u=3"
          },
          "likes": 8,
          "commentsCount": 0,
          "views": 90,
          "createdAt": "2026-01-20T10:20:27.459+03:00"
        }
      ],
      "pagination": {
        "currentPage": 1,
        "totalPages": 5,
        "totalQuestions": 47,
        "limit": 10,
        "hasNextPage": true,
        "hasPreviousPage": false
      }
    }
  }
  ```

#### 4. Soru Detayı
- **URL**: `GET /questions/:id`
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "question": {
        "id": "2a5bc6e7-8ae3-4c6a-9893-292332b00948",
        "title": "En iyi cilt bakım rutini nedir?",
        "description": "<p>Detaylı açıklama...</p>",
        "user": { ... },
        "stats": { ... }
      },
      "answers": [
        {
          "id": "ce772b5b-b1e9-411e-baa8-960f85500978",
          "content": "Cevap içeriği...",
          "isAccepted": true,
          "user": {
            "username": "Ayse_K",
            "avatar": "..."
          },
          "likes": 12,
          "createdAt": "2026-01-20T10:25:00Z"
        }
      ]
    }
  }
  ```

#### 5. Soru Sor (Korumalı)
- **URL**: `POST /questions`
- **Headers**: `Authorization: Bearer <TOKEN>`
- **Body**:
  ```json
  {
    "title": "Soru başlığı minimum 10 karakter olmalı",
    "description": "<p>HTML formatında detay</p>",
    "category": "Moda & Güzellik",
    "tags": ["#etiket1", "#etiket2"],
    "image": "https://resim-linki.com/img.jpg"
  }
  ```
- **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Soru başarıyla oluşturuldu",
    "data": {
      "question": {
        "id": "yeni-soru-id-uuid",
        "title": "Soru başlığı...",
        "createdAt": "2026-01-20T10:30:00Z"
      }
    }
  }
  ```

## 📝 Notlar
- Kullanıcı şifreleri veritabanında **bcrypt** ile hashlenerek saklanır.
- Resimler şimdilik URL string olarak tutulmaktadır (Unsplash vb. kullanılabilir).
- Tarih formatları ISO 8601 olarak döner (örn: `2026-01-20T10:20:27.459+03:00`).
