function handleTextMouseDown(e) {
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  if (typingMode) {
    return;
  }
  // See if clicking on existing text:
  let clickedIndex = null;
  for (let i = textElements.length - 1; i >= 0; i--) {
    const te = textElements[i];
    ctx.save();
    let fontStr = '';
    if (te.italic) fontStr += 'italic ';
    if (te.bold) fontStr += 'bold ';
    fontStr += `${te.fontSize}px '${te.fontFamily}'`;
    ctx.font = fontStr;
    const metrics = ctx.measureText(te.text);
    const textWidth = metrics.width;
    const textHeight = te.fontSize;
    ctx.restore();
    const boxX = te.x;
    const boxY = te.y - textHeight;
    if (clickX >= boxX && clickX <= boxX + textWidth && clickY >= boxY && clickY <= boxY + textHeight) {
      clickedIndex = i;
      break;
    }
  }
  if (clickedIndex !== null) {
    selectedTextIndex = clickedIndex;
    editingIndex = null;
    const te = textElements[selectedTextIndex];
    textColorInp.value = te.color;
    fontSelect.value = te.fontFamily;
    textSizeInp.value = Math.round(te.fontSize);
    textOpacityInp.value = te.opacity;
    textBoldChk.checked = te.bold;
    textItalicChk.checked = te.italic;
    ctx.save();
    let fontStr = '';
    if (te.italic) fontStr += 'italic ';
    if (te.bold) fontStr += 'bold ';
    fontStr += `${te.fontSize}px '${te.fontFamily}'`;
    ctx.font = fontStr;
    const metrics = ctx.measureText(te.text);
    const textWidth = metrics.width;
    const textHeight = te.fontSize;
    ctx.restore();
    const handleSize = 10;
    const hx = te.x + textWidth;
    const hy = te.y;
    if (clickX >= hx - handleSize && clickX <= hx + handleSize && clickY >= hy - handleSize && clickY <= hy + handleSize) {
      textAction = 'resize';
      textResizeOrig = {
        origWidth: textWidth,
        origFontSize: te.fontSize,
        origX: te.x,
        origY: te.y
      };
    } else {
      textAction = 'drag';
      textDragOffset.dx = clickX - te.x;
      textDragOffset.dy = clickY - te.y;
    }
    updateUIState();
  } else {
    // Begin typing new text
    selectedTextIndex = null;
    textAction = null;
    pushStateForUndo();
    typingMode = true;
    editingIndex = null;
    typingPos.x = clickX;
    typingPos.y = clickY;
    typingText = "";
    typingStyle = {
      color: textColorInp.value,
      fontFamily: fontSelect.value,
      fontSize: parseInt(textSizeInp.value,10),
      opacity: parseFloat(textOpacityInp.value),
      bold: textBoldChk.checked,
      italic: textItalicChk.checked
    };
    window.addEventListener('keydown', handleTypingKey);
  }
}

function handleTextMouseMove(e) {
  if (selectedTextIndex === null) return;
  const te = textElements[selectedTextIndex];
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  if (textAction === 'drag') {
    te.x = mouseX - textDragOffset.dx;
    te.y = mouseY - textDragOffset.dy;
  } else if (textAction === 'resize' && textResizeOrig) {
    const deltaX = mouseX - (textResizeOrig.origX + textResizeOrig.origWidth);
    let newWidth = textResizeOrig.origWidth + deltaX;
    if (newWidth < 10) newWidth = 10;
    const scale = newWidth / textResizeOrig.origWidth;
    let newFontSize = textResizeOrig.origFontSize * scale;
    if (newFontSize < 8) newFontSize = 8;
    textElements[selectedTextIndex].fontSize = newFontSize;
  }
  updateUIState();
}

function handleTypingKey(evt) {
  if (!typingMode) {
    if (selectedTextIndex !== null && evt.key === 'Enter' && !simRunning) {
      evt.preventDefault();
      pushStateForUndo();
      editingIndex = selectedTextIndex;
      const te = textElements[editingIndex];
      typingMode = true;
      typingPos.x = te.x;
      typingPos.y = te.y;
      typingText = te.text;
      typingStyle = {
        color: te.color,
        fontFamily: te.fontFamily,
        fontSize: te.fontSize,
        opacity: te.opacity,
        bold: te.bold,
        italic: te.italic
      };
      window.addEventListener('keydown', handleTypingKey);
    }
    return;
  }
  evt.preventDefault();
  const key = evt.key;
  if (key === 'Enter') {
    finishTyping(true);
  } else if (key === 'Escape') {
    finishTyping(false);
  } else if (key === 'Backspace') {
    typingText = typingText.slice(0, -1);
  } else if (key.length === 1) {
    typingText += key;
  }
}

function finishTyping(commit) {
  if (commit && typingText.trim() !== "") {
    if (editingIndex !== null) {
      const te = textElements[editingIndex];
      te.text = typingText;
      te.color = typingStyle.color;
      te.fontFamily = typingStyle.fontFamily;
      te.fontSize = typingStyle.fontSize;
      te.opacity = typingStyle.opacity;
      te.bold = typingStyle.bold;
      te.italic = typingStyle.italic;
      selectedTextIndex = editingIndex;
    } else {
      textElements.push({
        text: typingText,
        x: typingPos.x,
        y: typingPos.y,
        color: typingStyle.color,
        fontFamily: typingStyle.fontFamily,
        fontSize: typingStyle.fontSize,
        opacity: typingStyle.opacity,
        bold: typingStyle.bold,
        italic: typingStyle.italic
      });
      selectedTextIndex = textElements.length - 1;
    }
  }
  typingMode = false;
  typingText = "";
  typingStyle = null;
  editingIndex = null;
  window.removeEventListener('keydown', handleTypingKey);
  updateUIState();
}

// Dynamic style updates when a text is selected or during typing:
textColorInp.addEventListener('input', () => {
  if (typingMode) {
    typingStyle.color = textColorInp.value;
  } else if (selectedTextIndex !== null) {
    textElements[selectedTextIndex].color = textColorInp.value;
  }
});
fontSelect.addEventListener('change', () => {
  if (typingMode) {
    typingStyle.fontFamily = fontSelect.value;
  } else if (selectedTextIndex !== null) {
    textElements[selectedTextIndex].fontFamily = fontSelect.value;
  }
});
textSizeInp.addEventListener('input', () => {
  const sz = parseInt(textSizeInp.value,10) || 1;
  if (typingMode) {
    typingStyle.fontSize = sz;
  } else if (selectedTextIndex !== null) {
    textElements[selectedTextIndex].fontSize = sz;
  }
});
textOpacityInp.addEventListener('input', () => {
  const op = parseFloat(textOpacityInp.value);
  if (typingMode) {
    typingStyle.opacity = op;
  } else if (selectedTextIndex !== null) {
    textElements[selectedTextIndex].opacity = op;
  }
});
textBoldChk.addEventListener('change', () => {
  if (typingMode) {
    typingStyle.bold = textBoldChk.checked;
  } else if (selectedTextIndex !== null) {
    textElements[selectedTextIndex].bold = textBoldChk.checked;
  }
});
textItalicChk.addEventListener('change', () => {
  if (typingMode) {
    typingStyle.italic = textItalicChk.checked;
  } else if (selectedTextIndex !== null) {
    textElements[selectedTextIndex].italic = textItalicChk.checked;
  }
});

