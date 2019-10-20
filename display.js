
fetch('menu.json')
  .then(response => response.text())
  .then((data) => {
    console.log (data);
  })

  // let jsonData = menuContainer.text().replace(/FI|M,|G,|VE|K,|L,|,| K| L|[()]|/g,'');