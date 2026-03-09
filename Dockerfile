# Usar una imagen ligera de Node.js
FROM node:20-slim

# Crear directorio de la app
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Compilar TypeScript
RUN npm run build

# Comando para iniciar la aplicación
CMD ["npm", "start"]
