package enbqa;
import com.atemukesu.extendednoteblock.sound.ActiveSoundFader;
import com.atemukesu.extendednoteblock.network.ModMessages;
import net.minecraft.core.BlockPos;
import java.util.UUID;
public class FaderAudit {
    static void check(boolean ok,String name){if(!ok)throw new AssertionError(name);System.out.println("PASS "+name);}
    static ActiveSoundFader note(int ticks,int in,int out){return new ActiveSoundFader(null,BlockPos.ZERO,UUID.randomUUID(),127,ticks,in,out);}
    public static void main(String[] args){
        for(int length:new int[]{1,2,20,80,1200}){
            var f=note(length,0,0);
            for(int t=1;t<length;t++)check(!f.tick(),"alive "+length+"/"+t);
            check(f.tick(),"ends at requested tick "+length);
            check(f.tick(),"stopped stays stopped");
        }
        var f=note(80,10,10);
        check(f.calculateStateAt(0).volume==0,"fade starts at zero");
        check(f.calculateStateAt(20/79f).volume==1,"sustain reaches full velocity");
        check(f.calculateStateAt(75/79f).volume<=.51f,"scheduled fade reduces held sample");
        for(int t=1;t<=20;t++)f.tick();
        f.startFadeOut();float previous=1;
        for(int t=1;t<10;t++){
            check(!f.tick(),"release fade still active");
            check(ModMessages.lastVolume<previous,"release fade descends");previous=ModMessages.lastVolume;
        }
        check(f.tick(),"release stops after fade duration, not sustain duration");
        f=note(80,0,0);f.tick();f.startFadeOut();check(f.tick(),"zero release is immediate");
        f=note(25,10,10);
        f.setVolumePoints(java.util.List.of(
            new com.atemukesu.extendednoteblock.util.CurvePoint(0,0),
            new com.atemukesu.extendednoteblock.util.CurvePoint(.5f,.8f),
            new com.atemukesu.extendednoteblock.util.CurvePoint(1,0)));
        check(f.calculateStateAt(0).volume==0,"independent curve starts silent");
        check(Math.abs(f.calculateStateAt(.25f).volume-.4f)<1e-6,"independent curve interpolates");
        check(Math.abs(f.calculateStateAt(.5f).volume-.8f)<1e-6,"curve overrides uniform envelope without double scaling");
        check(f.calculateStateAt(1).volume==0,"independent release reaches zero");
        System.out.println("ENB_FADER_COMPLETE");
    }
}
