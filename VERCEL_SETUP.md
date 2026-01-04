# Konfiguracja Vercel dla Sellhub Checkout

## Wymagane zmienne środowiskowe

W panelu Vercel (Settings → Environment Variables) dodaj następujące zmienne:

### Wymagane zmienne:

1. **SELLHUB_API_KEY**
   ```
   d7049f4a-a37b-47b7-8eb3-8565bdcce54d_wu604tj58c7lbxht10tk316quxxpvytdv5autmbplrzekr7bcbvny6f59ods9trg
   ```

2. **SELLHUB_STORE_ID**
   ```
   d7049f4a-a37b-47b7-8eb3-8565bdcce54d
   ```

3. **SELLHUB_PRODUCT_ID** (opcjonalne, domyślnie ustawione w kodzie)
   ```
   ac3ab96d-c3d5-4ebd-b9a2-d380def5adbb
   ```

### Opcjonalne zmienne:

4. **SELLHUB_STORE_URL** (opcjonalne, domyślnie ustawione)
   ```
   https://visiondevelopment.sellhub.cx
   ```

5. **RETURN_URL** (opcjonalne, domyślnie ustawione)
   ```
   https://shxdowcheats.net/purchase-success
   ```

## Instrukcja konfiguracji

1. Zaloguj się do Vercel Dashboard
2. Wybierz swój projekt
3. Przejdź do **Settings** → **Environment Variables**
4. Dodaj każdą zmienną osobno:
   - **Name**: Nazwa zmiennej (np. `SELLHUB_API_KEY`)
   - **Value**: Wartość zmiennej
   - **Environment**: Wybierz wszystkie środowiska (Production, Preview, Development)
5. Kliknij **Save**
6. Po dodaniu wszystkich zmiennych, przejdź do **Deployments** i zrób nowy deployment

## Struktura projektu

```
/
├── api/
│   ├── create-checkout.js          # Vercel Serverless Function (alternatywna struktura)
│   └── create-checkout/
│       └── index.js                # Vercel Serverless Function (preferowana struktura)
├── productpage/
│   └── fortnite-private.html       # Strona produktu z integracją
├── vercel.json                      # Konfiguracja Vercel
├── package.json                     # Konfiguracja Node.js
└── ...
```

**Uwaga:** Vercel rozpoznaje obie struktury, ale struktura folderowa (`api/create-checkout/index.js`) jest preferowana. Jeśli używasz struktury folderowej, możesz usunąć `api/create-checkout.js`.

## Mapowanie wariantów produktu

- **1 Day** ($7.99): `1b4fe06e-2f0d-4cc9-9a5b-dc248677ffaa`
- **7 Day** ($19.99): `187916fd-b3a3-4cf2-a12d-db71e7841d2f`
- **30 Day** ($39.99): `30ec2814-9130-477f-b1d9-1c284ed9ddbc`
- **Lifetime** ($99.99): `766c2717-4bcc-4578-b79f-c1a51549c6b8`

## Testowanie

Po wdrożeniu na Vercel:

1. Otwórz stronę produktu Fortnite Private
2. Wybierz wariant produktu
3. Kliknij "Purchase Now"
4. Wpisz email w formularzu
5. Kliknij "Continue to Checkout"
6. Powinieneś zostać przekierowany do Sellhub checkout

## Troubleshooting

### Błąd 404 (Not Found) dla `/api/create-checkout`
- **Rozwiązanie 1:** Upewnij się, że plik znajduje się w folderze `api/` w root projektu
- **Rozwiązanie 2:** Sprawdź czy używasz struktury folderowej (`api/create-checkout/index.js`)
- **Rozwiązanie 3:** Sprawdź logi w Vercel Dashboard → Functions → `create-checkout`
- **Rozwiązanie 4:** Upewnij się, że `vercel.json` i `package.json` są w root projektu
- **Rozwiązanie 5:** Po zmianach w strukturze, zrób nowy deployment na Vercel

### Błąd CORS
- Upewnij się, że endpoint `/api/create-checkout` jest dostępny
- Sprawdź czy funkcja jest poprawnie wdrożona na Vercel
- Sprawdź czy nagłówki CORS są ustawione w funkcji

### Błąd autoryzacji
- Sprawdź czy wszystkie zmienne środowiskowe są poprawnie ustawione w Vercel
- Upewnij się, że API Key jest kompletny i poprawny
- Sprawdź czy zmienne środowiskowe są dostępne dla wszystkich środowisk (Production, Preview, Development)

### Błąd tworzenia checkout
- Sprawdź logi w Vercel Dashboard → Functions → `create-checkout` → Logs
- Upewnij się, że Variant ID jest poprawny dla wybranego wariantu
- Sprawdź czy Sellhub API zwraca błędy (sprawdź logi funkcji)

