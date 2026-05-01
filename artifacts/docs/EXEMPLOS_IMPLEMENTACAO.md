# Exemplos de Implementação - Menthoros

Exemplos práticos de código para as melhorias recomendadas.

---

## 1. Backend - Segurança

### 1.1 Spring Security Configuration

**Arquivo:** `src/main/java/com/menthoros/config/SecurityConfig.java`

```java
package com.menthoros.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.Collections;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter,
                        JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.jwtAuthenticationEntryPoint = jwtAuthenticationEntryPoint;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(HttpSecurity http,
                                                      PasswordEncoder passwordEncoder) throws Exception {
        return http.getSharedObject(AuthenticationManagerBuilder.class)
            .passwordEncoder(passwordEncoder)
            .and()
            .build();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf().disable()
            .cors().and()
            .exceptionHandling()
                .authenticationEntryPoint(jwtAuthenticationEntryPoint)
            .and()
            .sessionManagement()
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            .and()
            .authorizeHttpRequests(auth -> auth
                // Public endpoints
                .requestMatchers("/api/v1/auth/**").permitAll()
                .requestMatchers("/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                // Protected endpoints - admin only
                .requestMatchers(HttpMethod.DELETE, "/api/v1/atleta/**").hasRole("ADMIN")

                // All other requests require authentication
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();

        // Restringir apenas aos domínios específicos
        configuration.setAllowedOrigins(Arrays.asList(
            "http://localhost:5173",  // Dev frontend
            "http://localhost:3000",  // Alternate port
            "https://menthoros.example.com"  // Production
        ));

        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        configuration.setAllowedHeaders(Arrays.asList("Content-Type", "Authorization", "X-Requested-With"));
        configuration.setExposedHeaders(Arrays.asList("Authorization", "X-Correlation-ID"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
    }
}
```

---

### 1.2 JWT Provider

**Arquivo:** `src/main/java/com/menthoros/infrastructure/security/JwtProvider.java`

```java
package com.menthoros.infrastructure.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Component
public class JwtProvider {

    @Value("${jwt.secret}")
    private String jwtSecret;

    @Value("${jwt.expiration-ms:86400000}") // 24 horas
    private long jwtExpirationMs;

    @Value("${jwt.refresh-expiration-ms:604800000}") // 7 dias
    private long refreshTokenExpirationMs;

    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(jwtSecret.getBytes());
    }

    /**
     * Gera um JWT token
     */
    public String generateToken(String userId, String email, String role) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("email", email);
        claims.put("role", role);
        return createToken(claims, userId, jwtExpirationMs);
    }

    /**
     * Gera um refresh token
     */
    public String generateRefreshToken(String userId) {
        return createToken(new HashMap<>(), userId, refreshTokenExpirationMs);
    }

    private String createToken(Map<String, Object> claims, String subject, long expirationTime) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + expirationTime);

        return Jwts.builder()
            .setClaims(claims)
            .setSubject(subject)
            .setIssuedAt(now)
            .setExpiration(expiryDate)
            .signWith(getSigningKey(), SignatureAlgorithm.HS512)
            .compact();
    }

    /**
     * Extrai o ID do usuário do token
     */
    public String getUserIdFromToken(String token) {
        return Jwts.parserBuilder()
            .setSigningKey(getSigningKey())
            .build()
            .parseClaimsJws(token)
            .getBody()
            .getSubject();
    }

    /**
     * Valida o token
     */
    public boolean validateToken(String token) {
        try {
            Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token);
            return true;
        } catch (SecurityException e) {
            log.error("Token signature validation failed: {}", e.getMessage());
        } catch (MalformedJwtException e) {
            log.error("Invalid JWT token: {}", e.getMessage());
        } catch (ExpiredJwtException e) {
            log.error("Expired JWT token: {}", e.getMessage());
        } catch (UnsupportedJwtException e) {
            log.error("Unsupported JWT token: {}", e.getMessage());
        } catch (IllegalArgumentException e) {
            log.error("JWT claims string is empty: {}", e.getMessage());
        }
        return false;
    }

    /**
     * Extrai email do token
     */
    public String getEmailFromToken(String token) {
        return (String) Jwts.parserBuilder()
            .setSigningKey(getSigningKey())
            .build()
            .parseClaimsJws(token)
            .getBody()
            .get("email");
    }

    /**
     * Verifica se token expirou
     */
    public boolean isTokenExpired(String token) {
        try {
            Date expiration = Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody()
                .getExpiration();
            return expiration.before(new Date());
        } catch (ExpiredJwtException e) {
            return true;
        }
    }
}
```

---

### 1.3 Authentication Filter

**Arquivo:** `src/main/java/com/menthoros/config/JwtAuthenticationFilter.java`

```java
package com.menthoros.config;

import com.menthoros.infrastructure.security.JwtProvider;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;

@Slf4j
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtProvider jwtProvider;

    public JwtAuthenticationFilter(JwtProvider jwtProvider) {
        this.jwtProvider = jwtProvider;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                  HttpServletResponse response,
                                  FilterChain filterChain) throws ServletException, IOException {
        try {
            String jwt = extractJwtFromRequest(request);

            if (jwt != null && jwtProvider.validateToken(jwt)) {
                String userId = jwtProvider.getUserIdFromToken(jwt);
                String email = jwtProvider.getEmailFromToken(jwt);

                // Criar authentication
                UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(
                        userId, null, Collections.singletonList(
                            new SimpleGrantedAuthority("ROLE_USER")
                        )
                    );

                authentication.setDetails(
                    new WebAuthenticationDetailsSource().buildDetails(request)
                );

                SecurityContextHolder.getContext().setAuthentication(authentication);

                log.debug("JWT validation successful for user: {}", userId);
            }
        } catch (Exception ex) {
            log.error("Could not set user authentication in security context", ex);
        }

        filterChain.doFilter(request, response);
    }

    private String extractJwtFromRequest(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");
        if (bearerToken != null && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }
        return null;
    }
}
```

---

### 1.4 Auth Controller

**Arquivo:** `src/main/java/com/menthoros/api/controller/AuthController.java`

```java
package com.menthoros.api.controller;

import com.menthoros.api.dto.request.LoginRequest;
import com.menthoros.api.dto.response.AuthResponse;
import com.menthoros.application.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Authentication", description = "API de autenticação")
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    @Operation(summary = "Login com credenciais")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        AuthResponse response = authService.login(request.getEmail(), request.getPassword());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/refresh")
    @Operation(summary = "Renovar token JWT")
    public ResponseEntity<AuthResponse> refresh(@RequestHeader("Authorization") String refreshToken) {
        String token = refreshToken.replace("Bearer ", "");
        AuthResponse response = authService.refreshToken(token);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/logout")
    @Operation(summary = "Fazer logout")
    public ResponseEntity<Void> logout() {
        // Implementar blacklist de tokens se necessário
        return ResponseEntity.ok().build();
    }
}
```

---

### 1.5 Rate Limiting Configuration

**Arquivo:** `src/main/java/com/menthoros/config/RateLimitConfig.java`

```java
package com.menthoros.config;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Bucket4j;
import io.github.bucket4j.Refill;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Configuration
public class RateLimitConfig implements WebMvcConfigurer {

    private final Map<String, Bucket> cache = new ConcurrentHashMap<>();

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new RateLimitInterceptor(cache))
            .addPathPatterns("/api/**")
            .excludePathPatterns("/api/v1/auth/**", "/api-docs/**");
    }

    private static class RateLimitInterceptor implements HandlerInterceptor {
        private final Map<String, Bucket> cache;

        RateLimitInterceptor(Map<String, Bucket> cache) {
            this.cache = cache;
        }

        @Override
        public boolean preHandle(HttpServletRequest request,
                               HttpServletResponse response,
                               Object handler) throws Exception {

            String key = getClientKey(request);
            Bucket bucket = cache.computeIfAbsent(key, k -> createNewBucket());

            if (bucket.tryConsume(1)) {
                response.addHeader("X-Rate-Limit-Remaining",
                    String.valueOf(bucket.getAvailableTokens()));
                return true;
            } else {
                response.setStatus(429); // Too Many Requests
                response.getWriter().write("You have exhausted your API Request Quota");
                return false;
            }
        }

        private String getClientKey(HttpServletRequest request) {
            // Usar IP do cliente ou user ID se autenticado
            String userId = request.getUserPrincipal() != null ?
                request.getUserPrincipal().getName() : null;

            if (userId != null) {
                return userId;
            }

            return request.getRemoteAddr();
        }

        private Bucket createNewBucket() {
            Bandwidth limit = Bandwidth.classic(100, Refill.intervally(100, Duration.ofMinutes(1)));
            return Bucket4j.builder()
                .addLimit(limit)
                .build();
        }
    }
}
```

---

### 1.6 Input Validation - DTOs

**Arquivo:** `src/main/java/com/menthoros/api/dto/request/CreateAtletaRequest.java`

```java
package com.menthoros.api.dto.request;

import jakarta.validation.constraints.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CreateAtletaRequest {

    @NotBlank(message = "Nome é obrigatório")
    @Size(min = 3, max = 100, message = "Nome deve ter entre 3 e 100 caracteres")
    private String nome;

    @Email(message = "Email deve ser válido")
    @NotBlank(message = "Email é obrigatório")
    private String email;

    @NotNull(message = "Idade é obrigatória")
    @Min(value = 0, message = "Idade deve ser >= 0")
    @Max(value = 150, message = "Idade deve ser <= 150")
    private Integer idade;

    @NotNull(message = "FC máximo é obrigatório")
    @Positive(message = "FC máximo deve ser positivo")
    private Integer fcMaximo;

    @NotNull(message = "FC repouso é obrigatório")
    @Positive(message = "FC repouso deve ser positivo")
    private Integer fcRepouso;

    @NotNull(message = "VO2Max é obrigatório")
    @Positive(message = "VO2Max deve ser positivo")
    private Double vo2Max;

    @NotBlank(message = "Nível de experiência é obrigatório")
    @Pattern(
        regexp = "INICIANTE|INTERMEDIARIO|AVANCADO",
        message = "Nível deve ser INICIANTE, INTERMEDIARIO ou AVANCADO"
    )
    private String nivelExperiencia;
}
```

---

## 2. Frontend - Autenticação

### 2.1 Auth Hook com JWT

**Arquivo:** `src/hooks/useAuth.ts`

```typescript
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

interface User {
  id: string;
  email: string;
  role: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export const useAuth = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<AuthState>(() => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    return {
      user: user ? JSON.parse(user) : null,
      token,
      isAuthenticated: !!token,
      isLoading: false,
      error: null,
    };
  });

  const login = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await axios.post('/api/v1/auth/login', {
        email,
        password,
      });

      const { token, user } = response.data;

      // Salvar token e user no localStorage
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      // Configurar header padrão do axios
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      setState({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      navigate('/');
      return { success: true };
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Login falhou';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      return { success: false, error: errorMessage };
    }
  }, [navigate]);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];

    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });

    navigate('/login');
  }, [navigate]);

  const refreshToken = useCallback(async () => {
    if (!state.token) return;

    try {
      const response = await axios.post('/api/v1/auth/refresh', {}, {
        headers: { Authorization: `Bearer ${state.token}` },
      });

      const { token } = response.data;
      localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      setState((prev) => ({
        ...prev,
        token,
      }));
    } catch (error) {
      logout();
    }
  }, [state.token, logout]);

  return {
    ...state,
    login,
    logout,
    refreshToken,
  };
};
```

---

### 2.2 Protected Route Component

**Arquivo:** `src/components/ProtectedRoute.tsx`

```typescript
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { CircularProgress, Box } from '@mui/material';

interface ProtectedRouteProps {
  element: React.ReactElement;
  requiredRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  element,
  requiredRoles = [],
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles.length > 0 && user && !requiredRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return element;
};
```

---

### 2.3 Login Page

**Arquivo:** `src/pages/login/LoginPage.tsx`

```typescript
import React, { useState } from 'react';
import {
  Box,
  Container,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Typography,
  Paper,
} from '@mui/material';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isLoading, error } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await login(formData.email, formData.password);
    if (result.success) {
      navigate('/');
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            padding: 4,
            borderRadius: 2,
            width: '100%',
          }}
        >
          <Typography variant="h4" component="h1" gutterBottom align="center">
            Login - Menthoros
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              margin="normal"
              disabled={isLoading}
              required
            />
            <TextField
              fullWidth
              label="Senha"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              margin="normal"
              disabled={isLoading}
              required
            />
            <Button
              fullWidth
              variant="contained"
              type="submit"
              sx={{ mt: 3 }}
              disabled={isLoading}
            >
              {isLoading ? <CircularProgress size={24} /> : 'Login'}
            </Button>
          </form>
        </Paper>
      </Box>
    </Container>
  );
};
```

---

## 3. Database Migrations

### 3.1 Add Authentication Tables

**Arquivo:** `src/main/resources/db/migration/V17__Add_Auth_Tables.sql`

```sql
-- Criar tabela de usuários
CREATE TABLE tb_usuario (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'ROLE_USER',
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_role CHECK (role IN ('ROLE_USER', 'ROLE_ADMIN', 'ROLE_COACH'))
);

-- Índices
CREATE INDEX idx_usuario_email ON tb_usuario(email);
CREATE INDEX idx_usuario_ativo ON tb_usuario(ativo);

-- Adicionar relação com tb_atleta
ALTER TABLE tb_atleta ADD COLUMN usuario_id BIGINT;
ALTER TABLE tb_atleta ADD CONSTRAINT fk_atleta_usuario
    FOREIGN KEY (usuario_id) REFERENCES tb_usuario(id);
CREATE INDEX idx_atleta_usuario ON tb_atleta(usuario_id);

-- Audit fields
ALTER TABLE tb_atleta ADD COLUMN criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE tb_atleta ADD COLUMN criado_por VARCHAR(255);
ALTER TABLE tb_atleta ADD COLUMN atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE tb_atleta ADD COLUMN atualizado_por VARCHAR(255);
```

---

### 3.2 Add Database Indexes

**Arquivo:** `src/main/resources/db/migration/V18__Add_Performance_Indexes.sql`

```sql
-- Índices para melhor performance
CREATE INDEX idx_plano_atleta_data ON tb_plano_semanal(atleta_id, data_inicio DESC);
CREATE INDEX idx_treino_realizado_atleta_data ON tb_treino_realizado(atleta_id, data_execucao DESC);
CREATE INDEX idx_metricas_diarias_atleta_data ON tb_metricas_diarias(atleta_id, data DESC);
CREATE INDEX idx_treino_planejado_plano ON tb_treino_planejado(plano_semanal_id);

-- Indexes para buscas comuns
CREATE INDEX idx_atleta_ativo ON tb_atleta(ativo);
CREATE INDEX idx_plano_status ON tb_plano_semanal(status);
CREATE INDEX idx_treino_realizado_status ON tb_treino_realizado(status);

-- Criar partições se tabelas crescerem muito (futuro)
-- CREATE TABLE tb_treino_realizado_2026 PARTITION OF tb_treino_realizado
--     FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
```

---

## 4. Frontend - Validação com Zod

### 4.1 Validation Schemas

**Arquivo:** `src/utils/validation.ts`

```typescript
import { z } from 'zod';

// Schemas de validação
export const createAtletaSchema = z.object({
  nome: z
    .string()
    .min(3, 'Nome deve ter no mínimo 3 caracteres')
    .max(100, 'Nome deve ter no máximo 100 caracteres'),

  email: z
    .string()
    .email('Email inválido'),

  idade: z
    .number()
    .min(0, 'Idade deve ser >= 0')
    .max(150, 'Idade deve ser <= 150'),

  fcMaximo: z
    .number()
    .positive('FC máximo deve ser positivo'),

  fcRepouso: z
    .number()
    .positive('FC repouso deve ser positivo'),

  vo2Max: z
    .number()
    .positive('VO2Max deve ser positivo'),

  nivelExperiencia: z
    .enum(['INICIANTE', 'INTERMEDIARIO', 'AVANCADO'])
    .refine(
      (val) => val !== undefined,
      'Nível de experiência é obrigatório'
    ),
});

export type CreateAtletaInput = z.infer<typeof createAtletaSchema>;
```

---

### 4.2 Form with React Hook Form

**Arquivo:** `src/features/atleta/components/AtletaForm.tsx`

```typescript
import React from 'react';
import { useForm, Controller, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Box,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
} from '@mui/material';
import { createAtletaSchema, CreateAtletaInput } from '../../../utils/validation';

interface AtletaFormProps {
  onSubmit: (data: CreateAtletaInput) => Promise<void>;
  isLoading?: boolean;
  initialValues?: Partial<CreateAtletaInput>;
  error?: string | null;
}

export const AtletaForm: React.FC<AtletaFormProps> = ({
  onSubmit,
  isLoading = false,
  initialValues,
  error,
}) => {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateAtletaInput>({
    resolver: zodResolver(createAtletaSchema),
    defaultValues: initialValues || {
      nivelExperiencia: 'INICIANTE',
    },
  });

  const handleFormSubmit: SubmitHandler<CreateAtletaInput> = async (data) => {
    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}

        <Controller
          name="nome"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Nome"
              fullWidth
              error={!!errors.nome}
              helperText={errors.nome?.message}
              disabled={isLoading}
            />
          )}
        />

        <Controller
          name="email"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Email"
              type="email"
              fullWidth
              error={!!errors.email}
              helperText={errors.email?.message}
              disabled={isLoading}
            />
          )}
        />

        <Controller
          name="idade"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Idade"
              type="number"
              fullWidth
              error={!!errors.idade}
              helperText={errors.idade?.message}
              disabled={isLoading}
              onChange={(e) => field.onChange(Number(e.target.value))}
            />
          )}
        />

        <Controller
          name="fcMaximo"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="FC Máximo"
              type="number"
              fullWidth
              error={!!errors.fcMaximo}
              helperText={errors.fcMaximo?.message}
              disabled={isLoading}
              onChange={(e) => field.onChange(Number(e.target.value))}
            />
          )}
        />

        <Controller
          name="fcRepouso"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="FC Repouso"
              type="number"
              fullWidth
              error={!!errors.fcRepouso}
              helperText={errors.fcRepouso?.message}
              disabled={isLoading}
              onChange={(e) => field.onChange(Number(e.target.value))}
            />
          )}
        />

        <Controller
          name="vo2Max"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="VO2Max"
              type="number"
              step="0.1"
              fullWidth
              error={!!errors.vo2Max}
              helperText={errors.vo2Max?.message}
              disabled={isLoading}
              onChange={(e) => field.onChange(Number(e.target.value))}
            />
          )}
        />

        <Controller
          name="nivelExperiencia"
          control={control}
          render={({ field }) => (
            <FormControl fullWidth error={!!errors.nivelExperiencia}>
              <InputLabel>Nível de Experiência</InputLabel>
              <Select
                {...field}
                label="Nível de Experiência"
                disabled={isLoading}
              >
                <MenuItem value="INICIANTE">Iniciante</MenuItem>
                <MenuItem value="INTERMEDIARIO">Intermediário</MenuItem>
                <MenuItem value="AVANCADO">Avançado</MenuItem>
              </Select>
            </FormControl>
          )}
        />

        <Button
          variant="contained"
          type="submit"
          fullWidth
          disabled={isLoading}
        >
          {isLoading ? <CircularProgress size={24} /> : 'Salvar Atleta'}
        </Button>
      </Box>
    </form>
  );
};
```

---

## 5. Backend - Testes

### 5.1 Service Unit Test

**Arquivo:** `src/test/java/com/menthoros/application/service/impl/AtletaServiceImplTest.java`

```java
package com.menthoros.application.service.impl;

import com.menthoros.api.dto.request.CreateAtletaRequest;
import com.menthoros.api.dto.response.AtletaResponse;
import com.menthoros.domain.model.Atleta;
import com.menthoros.domain.repository.AtletaRepository;
import com.menthoros.api.dto.mapper.AtletaMapper;
import com.menthoros.exception.DuplicateResourceException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class AtletaServiceImplTest {

    @Mock
    private AtletaRepository atletaRepository;

    @Mock
    private AtletaMapper atletaMapper;

    @InjectMocks
    private AtletaServiceImpl atletaService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
    }

    @Test
    void testCreateAtletaShouldSucceed() {
        // Arrange
        CreateAtletaRequest request = new CreateAtletaRequest();
        request.setNome("João Silva");
        request.setEmail("joao@example.com");
        request.setIdade(25);
        request.setFcMaximo(190);
        request.setFcRepouso(60);
        request.setVo2Max(50.0);
        request.setNivelExperiencia("INTERMEDIARIO");

        Atleta atleta = new Atleta();
        atleta.setId(1L);
        atleta.setNome("João Silva");
        atleta.setEmail("joao@example.com");

        AtletaResponse response = new AtletaResponse();
        response.setId(1L);
        response.setNome("João Silva");

        when(atletaRepository.findByEmail(request.getEmail())).thenReturn(null);
        when(atletaRepository.save(any(Atleta.class))).thenReturn(atleta);
        when(atletaMapper.toResponse(atleta)).thenReturn(response);

        // Act
        AtletaResponse result = atletaService.create(request);

        // Assert
        assertNotNull(result);
        assertEquals("João Silva", result.getNome());
        verify(atletaRepository, times(1)).save(any(Atleta.class));
    }

    @Test
    void testCreateAtletaWithDuplicateEmailShouldThrow() {
        // Arrange
        CreateAtletaRequest request = new CreateAtletaRequest();
        request.setEmail("existing@example.com");

        Atleta existingAtleta = new Atleta();
        when(atletaRepository.findByEmail(request.getEmail()))
            .thenReturn(existingAtleta);

        // Act & Assert
        assertThrows(DuplicateResourceException.class, () -> {
            atletaService.create(request);
        });
        verify(atletaRepository, never()).save(any());
    }

    @Test
    void testGetAtletaByIdShouldReturnAtleta() {
        // Arrange
        Long atletaId = 1L;
        Atleta atleta = new Atleta();
        atleta.setId(atletaId);

        AtletaResponse response = new AtletaResponse();
        response.setId(atletaId);

        when(atletaRepository.findById(atletaId)).thenReturn(java.util.Optional.of(atleta));
        when(atletaMapper.toResponse(atleta)).thenReturn(response);

        // Act
        AtletaResponse result = atletaService.getById(atletaId);

        // Assert
        assertNotNull(result);
        assertEquals(atletaId, result.getId());
    }
}
```

---

### 5.2 Integration Test with TestContainers

**Arquivo:** `src/test/java/com/menthoros/integration/AtletaControllerIntegrationTest.java`

```java
package com.menthoros.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.menthoros.api.dto.request.CreateAtletaRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@Testcontainers
@AutoConfigureMockMvc
class AtletaControllerIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
        .withDatabaseName("menthoros_test")
        .withUsername("test")
        .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void testCreateAtletaIntegration() throws Exception {
        // Arrange
        CreateAtletaRequest request = new CreateAtletaRequest();
        request.setNome("Integration Test Atleta");
        request.setEmail("integration@example.com");
        request.setIdade(30);
        request.setFcMaximo(185);
        request.setFcRepouso(55);
        request.setVo2Max(52.0);
        request.setNivelExperiencia("AVANCADO");

        // Act & Assert
        mockMvc.perform(post("/api/v1/atleta")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").exists())
            .andExpect(jsonPath("$.nome").value("Integration Test Atleta"));
    }
}
```

---

## Próximos Passos

1. Implementar os exemplos acima em branches separadas
2. Executar testes localmente
3. Fazer code review
4. Mesclar para `develop`
5. Deploy para staging
6. Validar em produção

---

**Última Atualização:** 28 de fevereiro de 2026
