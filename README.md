# CPF App — Etapa 1 de 4

React + Vite. Tela 1 (validação de identidade / CPF) implementada, com estrutura pronta para as etapas 2–4.

## Rodar localmente

```
npm install
npm run dev
```

## Estrutura

```
src/
  components/StepProgress.jsx   # barra de progresso (Etapa X de 4)
  pages/Step1Cpf.jsx            # tela 1: input de CPF com máscara + validação
  pages/StepPlaceholder.jsx     # placeholder para as etapas 2-4
  utils/cpf.js                  # máscara e validação de dígito verificador
  App.jsx                       # orquestra o fluxo de 4 etapas
  App.css / index.css           # estilos (gradiente e componentes)
```

## Publicar no GitHub (repo vazio: github.com/serproid/newproject)

```
git init
git remote add origin https://github.com/serproid/newproject.git
git add .
git commit -m "Etapa 1: tela de validação de CPF"
git branch -M main
git push -u origin main
```
