/* Rose Four mathematical motion, after Paidax01 / Math Curve Loaders.
   Reference: https://paidax01.github.io/math-curve-loaders/
   Independent canvas renderer; r = a cos(4θ), 78-dot trail, breathing core.
   Runs only for visible loading/search states; reduced motion uses a static rose. */
class RoseFour {
  constructor(canvas) { this.canvas=canvas; this.active=false; this.frame=0; this.last=0; }
  start() { if(this.active)return; this.active=true; this.last=0; this.tick(performance.now()); }
  stop() { this.active=false; cancelAnimationFrame(this.frame); }
  tick(now) {
    if(!this.active)return;
    const still=document.documentElement.dataset.motion==='off'||matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!document.hidden&&(now-this.last>32||!this.last)) {
      this.last=now;
      const canvas=this.canvas,ctx=canvas.getContext('2d'),theme=document.documentElement.dataset.theme,dark=theme==='dark',glass=theme==='glass';
      const t=still?2200:now, pulse=.76+.24*Math.sin(t/4500*Math.PI*2+.55);
      const radius=(9.2+.6*pulse)*(.72+.28*pulse)*3.25;
      const point=p=>{const a=p*2*Math.PI,r=radius*Math.cos(4*a);return [Math.cos(a)*r,Math.sin(a)*r];};
      ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate(canvas.width/2,canvas.height/2);
      ctx.scale(canvas.width/100,canvas.height/100);ctx.rotate(-t/28000*Math.PI*2);
      ctx.strokeStyle=dark?'#b2d7eb27':glass?'#7683b728':'#53667820';ctx.lineWidth=.6;ctx.beginPath();
      for(let i=0;i<=480;i++){const [x,y]=point(i/480);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
      for(let i=77;i>=0;i--){const tail=i/77,fade=Math.pow(1-tail,.56);const [x,y]=point(t/5400-tail*.32);
        ctx.globalAlpha=.04+.96*fade;ctx.fillStyle=dark?'#b2d7eb':glass?'#7789b9':'#536678';
        ctx.beginPath();ctx.arc(x,y,.9+2.7*fade,0,2*Math.PI);ctx.fill();}
      ctx.globalAlpha=1;ctx.restore();
    }
    this.frame=requestAnimationFrame(n=>this.tick(n));
  }
}
