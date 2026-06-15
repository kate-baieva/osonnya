/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // @napi-rs/canvas має нативний бінарник — не бандлити вебпаком
    serverComponentsExternalPackages: ['@napi-rs/canvas'],
    // Включити шрифти й фон у serverless-функцію, що генерує сертифікат
    outputFileTracingIncludes: {
      '/api/webhook/wayforpay': [
        './public/cert-background.png',
        './public/logo-white.svg',
        './public/fonts/Mak.otf',
        './public/fonts/Montserrat_Alternates/MontserratAlternates-Light.ttf',
        './public/fonts/Montserrat_Alternates/MontserratAlternates-Regular.ttf',
      ],
      '/api/buy-certificate': [
        './public/cert-background.png',
        './public/logo-white.svg',
        './public/fonts/Mak.otf',
        './public/fonts/Montserrat_Alternates/MontserratAlternates-Light.ttf',
        './public/fonts/Montserrat_Alternates/MontserratAlternates-Regular.ttf',
      ],
    },
  },
}

module.exports = nextConfig
