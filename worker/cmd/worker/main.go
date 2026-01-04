package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/hibiken/asynq"
	"github.com/joho/godotenv"
	"github.com/sirupsen/logrus"
)

var logger = logrus.New()

func main() {
	// Load environment variables
	_ = godotenv.Load()

	// Setup logger
	setupLogger()

	logger.Info("Starting GeoAgent Worker...")

	// Get Redis connection
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}

	// Parse Redis connection
	redisOpt, err := asynq.ParseRedisURI(redisURL)
	if err != nil {
		logger.Fatalf("Failed to parse Redis URL: %v", err)
	}

	// Create Asynq server
	srv := asynq.NewServer(
		redisOpt,
		asynq.Config{
			Concurrency: getEnvAsInt("WORKER_CONCURRENCY", 5),
			Queues: map[string]int{
				"critical": 10,
				"default":  5,
				"low":      1,
			},
			ErrorHandler: asynq.ErrorHandlerFunc(handleError),
		},
	)

	// Create task handler mux
	mux := asynq.NewServeMux()

	// Register task handlers
	registerHandlers(mux)

	// Start metrics server
	go startMetricsServer()

	// Handle shutdown signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		logger.Info("Received shutdown signal, gracefully shutting down...")
		srv.Shutdown()
	}()

	// Start worker
	logger.Info("GeoAgent Worker started successfully")
	if err := srv.Run(mux); err != nil {
		logger.Fatalf("Failed to run worker: %v", err)
	}
}

func setupLogger() {
	logLevel := os.Getenv("LOG_LEVEL")
	switch logLevel {
	case "debug":
		logger.SetLevel(logrus.DebugLevel)
	case "info":
		logger.SetLevel(logrus.InfoLevel)
	case "warn":
		logger.SetLevel(logrus.WarnLevel)
	case "error":
		logger.SetLevel(logrus.ErrorLevel)
	default:
		logger.SetLevel(logrus.InfoLevel)
	}

	logger.SetFormatter(&logrus.JSONFormatter{})
	logger.SetOutput(os.Stdout)
}

func registerHandlers(mux *asynq.ServeMux) {
	// Register spatial processing tasks
	mux.HandleFunc("geo:process_file", handleProcessFile)
	mux.HandleFunc("geo:generate_heatmap", handleGenerateHeatmap)
	mux.HandleFunc("geo:analyze_trajectory", handleAnalyzeTrajectory)
	mux.HandleFunc("geo:spatial_clustering", handleSpatialClustering)
	mux.HandleFunc("geo:route_optimization", handleRouteOptimization)

	logger.Info("Registered all task handlers")
}

func handleError(ctx context.Context, task *asynq.Task, err error) {
	logger.WithFields(logrus.Fields{
		"task_type":    task.Type(),
		"task_payload": string(task.Payload()),
		"error":        err.Error(),
	}).Error("Task processing failed")
}

func handleProcessFile(ctx context.Context, task *asynq.Task) error {
	logger.WithField("task", "process_file").Info("Processing file")
	// Implementation would process geospatial files
	return nil
}

func handleGenerateHeatmap(ctx context.Context, task *asynq.Task) error {
	logger.WithField("task", "generate_heatmap").Info("Generating heatmap")
	// Implementation would generate heatmap from spatial data
	return nil
}

func handleAnalyzeTrajectory(ctx context.Context, task *asynq.Task) error {
	logger.WithField("task", "analyze_trajectory").Info("Analyzing trajectory")
	// Implementation would analyze movement patterns
	return nil
}

func handleSpatialClustering(ctx context.Context, task *asynq.Task) error {
	logger.WithField("task", "spatial_clustering").Info("Performing spatial clustering")
	// Implementation would perform DBSCAN or other clustering
	return nil
}

func handleRouteOptimization(ctx context.Context, task *asynq.Task) error {
	logger.WithField("task", "route_optimization").Info("Optimizing route")
	// Implementation would optimize delivery routes
	return nil
}

func startMetricsServer() {
	port := os.Getenv("METRICS_PORT")
	if port == "" {
		port = "9097"
	}

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "healthy")
	})

	http.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		// Would export Prometheus metrics here
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "# HELP geoagent_tasks_processed_total Total number of tasks processed")
		fmt.Fprintln(w, "# TYPE geoagent_tasks_processed_total counter")
		fmt.Fprintln(w, "geoagent_tasks_processed_total 0")
	})

	logger.Infof("Metrics server listening on :%s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		logger.Errorf("Metrics server failed: %v", err)
	}
}

func getEnvAsInt(key string, defaultVal int) int {
	if val := os.Getenv(key); val != "" {
		var intVal int
		if _, err := fmt.Sscanf(val, "%d", &intVal); err == nil {
			return intVal
		}
	}
	return defaultVal
}