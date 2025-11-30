#!/bin/bash

# Verifica se o avifenc está instalado
if ! command -v avifenc &> /dev/null; then
    echo "Erro: avifenc não está instalado. Instale com: brew install libavif"
    exit 1
fi

# Loop em todos os JPG/JPEG da pasta
for img in *.jpg *.jpeg; do
    # Verifica se o arquivo existe (evita erros se não houver JPGs)
    [ -e "$img" ] || continue

    base="${img%.*}"
    echo "Convertendo $img → $base.avif"

    # Converte para AVIF com qualidade boa (pode ajustar)
    avifenc --min 20 --max 30 "$img" "$base.avif"

    # Se conversão foi bem-sucedida, apaga o original
    if [ $? -eq 0 ]; then
        echo "Apagando $img"
        rm "$img"
    else
        echo "Erro ao converter $img — arquivo JPG preservado"
    fi
done

echo "Finalizado!"
