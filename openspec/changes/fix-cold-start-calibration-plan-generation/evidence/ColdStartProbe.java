import java.lang.reflect.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.time.*;
import br.com.menthoros.backend.entity.*;
import br.com.menthoros.backend.enums.*;
import br.com.menthoros.backend.repository.*;
import br.com.menthoros.backend.services.*;
import br.com.menthoros.backend.services.impl.*;
import br.com.menthoros.backend.services.helper.*;
import br.com.menthoros.backend.services.prompt.*;
import br.com.menthoros.backend.services.onboarding.impl.*;
import br.com.menthoros.backend.dto.llm.*;
import br.com.menthoros.backend.multitenancy.*;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
public class ColdStartProbe {
 static <T> T proxy(Class<T> type, InvocationHandler h) { return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class[]{type},h)); }
 static Object empty(Method m) { if(m.getReturnType()==Optional.class)return Optional.empty();if(m.getReturnType()==List.class)return List.of();return null; }
 static EtapaTreinoLlmDto etapa(String tipo,int minutos,double km) {return new EtapaTreinoLlmDto(1,tipo,tipo,minutos,km,null,1,null);}
 static PlanoSemanalLlmDto plan(boolean validStructure) {
  List<EtapaTreinoLlmDto> stages= validStructure ? List.of(etapa("AQUECIMENTO",10,1.4),etapa("INTERVALADO",4,.8),etapa("RECUPERACAO",4,.5),etapa("INTERVALADO",4,.8),etapa("RECUPERACAO",4,.5),etapa("DESAQUECIMENTO",10,.86)) : List.of(etapa("AQUECIMENTO",10,1.4),etapa("INTERVALADO",4,.8),etapa("RECUPERACAO",4,.5),etapa("DESAQUECIMENTO",10,.86));
  var treino=new TreinoPlanejadoLlmDto("TERCA","INTERVALADO",null,20,.8,4,"fixture diagnostica","36:00",4.0,"5:00-5:30/km",stages);
  return new PlanoSemanalLlmDto(4,4,0.,0.,"PLANEJADO","Diagnostico",List.of(treino));
 }
 public static void main(String[] args) throws Exception {
  UUID athleteId=UUID.fromString("00000000-0000-0000-0000-000000000001");
  AtomicInteger rebuilds=new AtomicInteger();
  var tsb=proxy(TsbService.class,(p,m,a)->{if(m.getName().equals("recalcularHistoricoCompleto"))rebuilds.incrementAndGet();return empty(m);});
  var metrics=proxy(MetricasDiariasRepository.class,(p,m,a)->empty(m));
  var baseline=new BaselineCalculatorImpl(tsb,metrics);
  var result=baseline.calcular(athleteId,NivelExperiencia.INICIANTE,List.of());
  System.out.println("BASELINE sem historico: origem="+result.ctlOrigem()+", fullRebuildCalls="+rebuilds.get());
  var atleta=Atleta.builder().id(athleteId).nivelExperiencia(NivelExperiencia.INICIANTE).build();
  var athletes=proxy(AtletaRepository.class,(p,m,a)->m.getName().equals("findByIdAndTenantId")?Optional.of(atleta):empty(m));
  var workouts=proxy(TreinoRealizadoRepository.class,(p,m,a)->empty(m));
  var races=proxy(ProvaRepository.class,(p,m,a)->empty(m));
  var checkins=proxy(CheckinProntidaoRepository.class,(p,m,a)->empty(m));
  var provider=new TreinoHistoricoProvider(workouts,races,checkins,Clock.fixed(Instant.parse("2026-09-07T12:00:00Z"),ZoneOffset.UTC));
  var registry=new SimpleMeterRegistry();
  var resilience=new PlanoResilienceService(registry);
  var pace=new PaceValidator();
  var ia=new IaServiceImpl(null,null,athletes,null,provider,new PaceHistoricoFormatter(),pace,new ZonaTreinoService(),null,new PlanoEstruturaReparador(registry),resilience,registry,new LlmUsageLogger());
  Method validate=IaServiceImpl.class.getDeclaredMethod("validarENormalizarPlanoGerado",PlanoSemanalLlmDto.class,UUID.class);validate.setAccessible(true);
  AtomicInteger attempts=new AtomicInteger();
  TenantContext.setTenantId(UUID.fromString("00000000-0000-0000-0000-000000000002"));
  try {
   var out=resilience.gerarComResiliencia(prompt->plan(attempts.incrementAndGet()>1),input->{try{return (PlanoSemanalLlmDto)validate.invoke(ia,input,athleteId);}catch(InvocationTargetException e){throw (RuntimeException)e.getCause();}catch(Exception e){throw new RuntimeException(e);}},"fixture sintetica baseada nos sintomas do log; sem chamada externa");
   var treino=out.treinosPlanejados().getFirst();
   double minutos=Double.parseDouble(treino.duracaoMin().split(":")[0]);
   double expected=pace.calcularPaceMedia(treino.ritmoAlvo()).orElseThrow()*treino.distanciaKm();
   double deviation=Math.abs(minutos-expected)/expected;
   System.out.printf(Locale.ROOT,"REPLAY attempts=%d accepted=true duration=%.1f distance=%.2f pace=%s deviation=%.1f%%\n",attempts.get(),minutos,treino.distanciaKm(),treino.ritmoAlvo(),deviation*100);
   if(deviation>.20)throw new AssertionError("RED: pipeline aceita treino apos retry com desvio acima do limite de aviso de 20%");
  } finally {TenantContext.clear();}
 }
}
