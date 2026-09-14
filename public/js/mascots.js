export const MASCOTS = Object.freeze({
  idle:{src:'./assets/mascots/idle.png',label:'Аня машет рукой, кошечка Снежки рядом'},
  thinking:{src:'./assets/mascots/thinking.png',label:'Аня и Снежки думают над примером'},
  correct:{src:'./assets/mascots/correct.png',label:'Аня показывает большой палец, Снежки поднимает лапку'},
  almost:{src:'./assets/mascots/almost.png',label:'Аня задумалась, Снежки спокойно поддерживает её'},
  hint:{src:'./assets/mascots/hint.png',label:'У Ани появилась идея, Снежки открыла книгу'},
  levelComplete:{src:'./assets/mascots/levelComplete.png',label:'Аня и Снежки радуются завершённому этапу'},
  noLives:{src:'./assets/mascots/noLives.png',label:'Аня держит книги, Снежки отдыхает'},
});
export function renderMascot(element,reaction) {
  const name=Object.hasOwn(MASCOTS,reaction)?reaction:'idle', mascot=MASCOTS[name], image=element.querySelector('img');
  element.dataset.reaction=name;element.setAttribute('aria-label',mascot.label);
  if(image.getAttribute('src')!==mascot.src)image.setAttribute('src',mascot.src);
}
