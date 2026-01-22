// predictive_models.js - AI Predictive Models using TensorFlow.js
// Contains machine learning models for student performance prediction

// Global variables for trained models
let performancePredictionModel = null;
let skillGapModel = null;
let trendAnalysisModel = null;

// ==========================================
// MODEL 1: PERFORMANCE PREDICTION MODEL
// ==========================================

// Train model to predict next exam performance
export async function trainPerformancePredictionModel(studentData) {
    try {
        console.log('Training performance prediction model...');

        if (!studentData || studentData.length < 2) {
            console.warn('Insufficient data for training performance prediction model (need at least 2 students)');
            return null;
        }

        // Prepare training data
        const { inputs, labels } = preparePerformanceTrainingData(studentData);

        if (inputs.length === 0) {
            console.warn('No valid training data prepared');
            return null;
        }

        // Create sequential model
        const model = tf.sequential();

        // Input layer + hidden layers
        model.add(tf.layers.dense({
            inputShape: [inputs[0].length],
            units: 64,
            activation: 'relu',
            kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
        }));

        model.add(tf.layers.dropout({ rate: 0.2 }));

        model.add(tf.layers.dense({
            units: 32,
            activation: 'relu',
            kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
        }));

        model.add(tf.layers.dropout({ rate: 0.1 }));

        // Output layer (single value prediction)
        model.add(tf.layers.dense({ units: 1, activation: 'linear' }));

        // Compile model
        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'meanSquaredError',
            metrics: ['mae']
        });

        // Convert data to tensors
        const inputTensor = tf.tensor2d(inputs);
        const labelTensor = tf.tensor2d(labels, [labels.length, 1]);

        // Train model
        await model.fit(inputTensor, labelTensor, {
            epochs: 100,
            batchSize: 32,
            validationSplit: 0.2,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    if (epoch % 20 === 0) {
                        console.log(`Epoch ${epoch}: loss = ${logs.loss.toFixed(4)}, val_loss = ${logs.val_loss?.toFixed(4) || 'N/A'}`);
                    }
                }
            }
        });

        // Clean up tensors
        inputTensor.dispose();
        labelTensor.dispose();

        performancePredictionModel = model;
        console.log('Performance prediction model trained successfully');
        return model;

    } catch (error) {
        console.error('Error training performance prediction model:', error);
        return null;
    }
}

// Prepare training data for performance prediction
function preparePerformanceTrainingData(studentData) {
    const inputs = [];
    const labels = [];

    studentData.forEach(student => {
        if (!student.exams || student.exams.length < 2) return;

        // Sort exams by date
        const sortedExams = student.exams.sort((a, b) =>
            new Date(a.created_at) - new Date(b.created_at)
        );

        // Create training samples from consecutive exams
        for (let i = 0; i < sortedExams.length - 1; i++) {
            const currentExam = sortedExams[i];
            const nextExam = sortedExams[i + 1];

            // Input features: current score, exam count, trend
            const input = [
                currentExam.total_score || 0,
                student.examCount || 1,
                calculateTrendScore(sortedExams.slice(0, i + 1))
            ];

            // Label: next exam score
            const label = nextExam.total_score || 0;

            inputs.push(input);
            labels.push(label);
        }
    });

    return { inputs, labels };
}

// Calculate trend score from recent exams
function calculateTrendScore(exams) {
    if (exams.length < 2) return 0;

    const recentScores = exams.slice(-3).map(e => e.total_score || 0);
    const trend = recentScores[recentScores.length - 1] - recentScores[0];
    return trend / 10; // Normalize
}

// Predict next exam performance for a student
export async function predictNextExamPerformance(student) {
    if (!performancePredictionModel) {
        console.warn('Performance prediction model not trained');
        return null;
    }

    try {
        // Prepare input features
        const trendScore = calculateTrendScore(student.exams || []);
        const inputFeatures = [
            student.avgScore || 0,
            student.examCount || 1,
            trendScore
        ];

        const inputTensor = tf.tensor2d([inputFeatures]);
        const prediction = performancePredictionModel.predict(inputTensor);
        const predictedScore = (await prediction.data())[0];

        inputTensor.dispose();
        prediction.dispose();

        // Ensure prediction is within valid range
        return Math.max(0, Math.min(100, predictedScore));

    } catch (error) {
        console.error('Error predicting next exam performance:', error);
        return null;
    }
}

// ==========================================
// MODEL 2: SKILL GAP IDENTIFICATION MODEL
// ==========================================

// Train model to identify skill gaps
export async function trainSkillGapModel(questionData, answerData) {
    try {
        console.log('Training skill gap identification model...');

        if (!questionData || !answerData || questionData.length < 3) {
            console.warn('Insufficient data for training skill gap model (need at least 3 questions)');
            return null;
        }

        // Prepare training data
        const { inputs, labels } = prepareSkillGapTrainingData(questionData, answerData);

        if (inputs.length === 0) {
            console.warn('No valid training data for skill gap model');
            return null;
        }

        // Create model for skill gap prediction
        const model = tf.sequential();

        model.add(tf.layers.dense({
            inputShape: [inputs[0].length],
            units: 128,
            activation: 'relu'
        }));

        model.add(tf.layers.dropout({ rate: 0.3 }));

        model.add(tf.layers.dense({
            units: 64,
            activation: 'relu'
        }));

        model.add(tf.layers.dropout({ rate: 0.2 }));

        // Output: probability of skill gap (binary classification)
        model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        // Train model
        const inputTensor = tf.tensor2d(inputs);
        const labelTensor = tf.tensor2d(labels, [labels.length, 1]);

        await model.fit(inputTensor, labelTensor, {
            epochs: 80,
            batchSize: 32,
            validationSplit: 0.2,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    if (epoch % 15 === 0) {
                        console.log(`Skill Gap Model - Epoch ${epoch}: accuracy = ${logs.acc?.toFixed(4) || 'N/A'}`);
                    }
                }
            }
        });

        inputTensor.dispose();
        labelTensor.dispose();

        skillGapModel = model;
        console.log('Skill gap model trained successfully');
        return model;

    } catch (error) {
        console.error('Error training skill gap model:', error);
        return null;
    }
}

// Prepare training data for skill gap identification
function prepareSkillGapTrainingData(questions, answers) {
    const inputs = [];
    const labels = [];

    // Group answers by question
    const questionStats = {};

    answers.forEach(answer => {
        const questionId = answer.question_id;
        if (!questionStats[questionId]) {
            questionStats[questionId] = {
                totalAttempts: 0,
                correctAttempts: 0,
                avgTime: 0,
                times: []
            };
        }

        questionStats[questionId].totalAttempts++;
        if (answer.is_correct) {
            questionStats[questionId].correctAttempts++;
        }
        if (answer.time_taken_seconds) {
            questionStats[questionId].times.push(answer.time_taken_seconds);
        }
    });

    // Calculate statistics and create training samples
    Object.keys(questionStats).forEach(questionId => {
        const stats = questionStats[questionId];
        const question = questions.find(q => q.id == questionId);

        if (!question) return;

        const accuracy = stats.correctAttempts / stats.totalAttempts;
        const avgTime = stats.times.length > 0 ?
            stats.times.reduce((a, b) => a + b, 0) / stats.times.length : 0;

        // Input features: difficulty, accuracy, avg time, question type
        const input = [
            question.scoring_weight || 1,
            accuracy,
            avgTime / 100, // normalize time
            getQuestionTypeEncoding(question.question_type)
        ];

        // Label: 1 if skill gap (low accuracy + high difficulty), 0 otherwise
        const isSkillGap = (accuracy < 0.5 && (question.scoring_weight || 1) > 2) ? 1 : 0;

        inputs.push(input);
        labels.push(isSkillGap);
    });

    return { inputs, labels };
}

// Encode question type as number
function getQuestionTypeEncoding(questionType) {
    const encodings = {
        'PGK': 0.1,
        'PGK MCMA': 0.2,
        'PGK Kategori': 0.3,
        'default': 0.0
    };
    return encodings[questionType] || encodings.default;
}

// Identify skill gaps for a student
export async function identifySkillGaps(studentAnswers, questions) {
    if (!skillGapModel) {
        console.warn('Skill gap model not trained');
        return [];
    }

    try {
        const skillGaps = [];

        // Group student's answers by question
        const studentQuestionStats = {};

        studentAnswers.forEach(answer => {
            const questionId = answer.question_id;
            if (!studentQuestionStats[questionId]) {
                studentQuestionStats[questionId] = {
                    attempts: 0,
                    correct: 0,
                    times: []
                };
            }

            studentQuestionStats[questionId].attempts++;
            if (answer.is_correct) {
                studentQuestionStats[questionId].correct++;
            }
            if (answer.time_taken_seconds) {
                studentQuestionStats[questionId].times.push(answer.time_taken_seconds);
            }
        });

        // Predict skill gaps for each question type/topic
        for (const [questionId, stats] of Object.entries(studentQuestionStats)) {
            const question = questions.find(q => q.id == questionId);
            if (!question) continue;

            const accuracy = stats.correct / stats.attempts;
            const avgTime = stats.times.length > 0 ?
                stats.times.reduce((a, b) => a + b, 0) / stats.times.length : 0;

            const inputFeatures = [
                question.scoring_weight || 1,
                accuracy,
                avgTime / 100,
                getQuestionTypeEncoding(question.question_type)
            ];

            const inputTensor = tf.tensor2d([inputFeatures]);
            const prediction = skillGapModel.predict(inputTensor);
            const gapProbability = (await prediction.data())[0];

            inputTensor.dispose();
            prediction.dispose();

            if (gapProbability > 0.7) { // High probability of skill gap
                skillGaps.push({
                    topic: question.chapter || 'Unknown',
                    subTopic: question.sub_chapter || question.chapter || 'Unknown',
                    questionType: question.question_type,
                    accuracy: accuracy * 100,
                    gapProbability: gapProbability,
                    recommendation: generateGapRecommendation(question, accuracy)
                });
            }
        }

        return skillGaps.sort((a, b) => b.gapProbability - a.gapProbability);

    } catch (error) {
        console.error('Error identifying skill gaps:', error);
        return [];
    }
}

// Generate recommendation for skill gap
function generateGapRecommendation(question, accuracy) {
    const recommendations = {
        low: "Perlu latihan intensif pada konsep dasar",
        medium: "Perlu penguatan pemahaman konsep",
        high: "Siap untuk materi lanjutan"
    };

    if (accuracy < 0.3) return recommendations.low;
    if (accuracy < 0.7) return recommendations.medium;
    return recommendations.high;
}

// ==========================================
// MODEL 3: TREND ANALYSIS MODEL
// ==========================================

// Train model for trend analysis and prediction
export async function trainTrendAnalysisModel(historicalData) {
    try {
        console.log('Training trend analysis model...');

        if (!historicalData || historicalData.length < 10) {
            console.warn('Insufficient historical data for trend analysis');
            return null;
        }

        // Prepare time series data
        const { inputs, labels } = prepareTrendTrainingData(historicalData);

        if (inputs.length === 0) {
            console.warn('No valid trend training data');
            return null;
        }

        // Create LSTM model for time series prediction
        const model = tf.sequential();

        // LSTM layers for sequence prediction
        model.add(tf.layers.lstm({
            inputShape: [inputs[0].length, inputs[0][0].length],
            units: 64,
            returnSequences: true
        }));

        model.add(tf.layers.dropout({ rate: 0.2 }));

        model.add(tf.layers.lstm({
            units: 32,
            returnSequences: false
        }));

        model.add(tf.layers.dropout({ rate: 0.2 }));

        model.add(tf.layers.dense({ units: 16, activation: 'relu' }));

        // Output: predicted trend direction and magnitude
        model.add(tf.layers.dense({ units: 2, activation: 'linear' }));

        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'meanSquaredError',
            metrics: ['mae']
        });

        // Train model
        const inputTensor = tf.tensor3d(inputs);
        const labelTensor = tf.tensor2d(labels);

        await model.fit(inputTensor, labelTensor, {
            epochs: 60,
            batchSize: 16,
            validationSplit: 0.2,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    if (epoch % 15 === 0) {
                        console.log(`Trend Model - Epoch ${epoch}: loss = ${logs.loss.toFixed(4)}`);
                    }
                }
            }
        });

        inputTensor.dispose();
        labelTensor.dispose();

        trendAnalysisModel = model;
        console.log('Trend analysis model trained successfully');
        return model;

    } catch (error) {
        console.error('Error training trend analysis model:', error);
        return null;
    }
}

// Prepare time series data for trend analysis
function prepareTrendTrainingData(historicalData) {
    const inputs = [];
    const labels = [];

    // Group data by time periods (assume weekly data)
    const timeSeriesData = groupDataByTimePeriods(historicalData);

    // Create sequences of 4 time periods to predict next period
    for (let i = 0; i < timeSeriesData.length - 4; i++) {
        const sequence = timeSeriesData.slice(i, i + 4);
        const nextPeriod = timeSeriesData[i + 4];

        if (sequence.length === 4 && nextPeriod) {
            // Input: sequence of [avg_score, participation_rate, pass_rate]
            inputs.push(sequence.map(period => [
                period.avgScore || 0,
                period.participationRate || 0,
                period.passRate || 0
            ]));

            // Label: predicted [trend_direction, magnitude]
            const trendDirection = nextPeriod.avgScore > sequence[3][0] ? 1 : -1;
            const magnitude = Math.abs(nextPeriod.avgScore - sequence[3][0]);

            labels.push([trendDirection, magnitude]);
        }
    }

    return { inputs, labels };
}

// Group historical data by time periods
function groupDataByTimePeriods(data) {
    // This is a simplified implementation
    // In real scenario, group by weeks/months
    const periods = [];
    const periodSize = Math.max(1, Math.floor(data.length / 10));

    for (let i = 0; i < data.length; i += periodSize) {
        const period = data.slice(i, i + periodSize);
        const avgScore = period.reduce((sum, d) => sum + (d.total_score || 0), 0) / period.length;
        const participationRate = period.length / periodSize;
        const passRate = period.filter(d => (d.total_score || 0) >= 70).length / period.length;

        periods.push({
            avgScore,
            participationRate,
            passRate
        });
    }

    return periods;
}

// Analyze learning trends for a student
export async function analyzeLearningTrends(student) {
    if (!trendAnalysisModel) {
        console.warn('Trend analysis model not trained');
        return null;
    }

    try {
        // Prepare recent performance sequence
        const recentExams = (student.exams || [])
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            .slice(-4);

        if (recentExams.length < 4) {
            return {
                trend: 'insufficient_data',
                prediction: null,
                confidence: 0
            };
        }

        // Create sequence input
        const sequence = recentExams.map(exam => [
            exam.total_score || 0,
            1, // participation rate (simplified)
            (exam.total_score || 0) >= 70 ? 1 : 0 // pass rate
        ]);

        const inputTensor = tf.tensor3d([sequence]);
        const prediction = trendAnalysisModel.predict(inputTensor);
        const predictedValues = await prediction.data();

        inputTensor.dispose();
        prediction.dispose();

        const trendDirection = predictedValues[0] > 0 ? 'improving' : 'declining';
        const magnitude = predictedValues[1];

        return {
            trend: trendDirection,
            magnitude: magnitude,
            confidence: 0.8, // Simplified confidence score
            prediction: {
                nextScore: student.avgScore + (predictedValues[0] * magnitude * 5),
                recommendation: trendDirection === 'improving' ?
                    'Lanjutkan strategi pembelajaran saat ini' :
                    'Perlu intervensi dan bantuan tambahan'
            }
        };

    } catch (error) {
        console.error('Error analyzing learning trends:', error);
        return null;
    }
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

// Initialize and train all models with available data
export async function initializePredictiveModels(analyticsData) {
    try {
        console.log('Initializing predictive models...');

        // Train performance prediction model
        if (analyticsData.students && analyticsData.students.length > 0) {
            await trainPerformancePredictionModel(analyticsData.students);
        }

        // Train skill gap model
        if (analyticsData.questions && analyticsData.answers) {
            await trainSkillGapModel(analyticsData.questions, analyticsData.answers);
        }

        // Train trend analysis model
        if (analyticsData.exams && analyticsData.exams.length > 20) {
            await trainTrendAnalysisModel(analyticsData.exams);
        }

        console.log('All predictive models initialized');

    } catch (error) {
        console.error('Error initializing predictive models:', error);
    }
}

// Get model training status
export function getModelStatus() {
    return {
        performanceModel: performancePredictionModel !== null,
        skillGapModel: skillGapModel !== null,
        trendModel: trendAnalysisModel !== null
    };
}

// Save models to local storage (simplified persistence)
export async function saveModels() {
    try {
        if (performancePredictionModel) {
            await performancePredictionModel.save('localstorage://performance-model');
        }
        if (skillGapModel) {
            await skillGapModel.save('localstorage://skill-gap-model');
        }
        if (trendAnalysisModel) {
            await trendAnalysisModel.save('localstorage://trend-model');
        }
        console.log('Models saved to local storage');
    } catch (error) {
        console.error('Error saving models:', error);
    }
}

// Load models from local storage
export async function loadModels() {
    try {
        performancePredictionModel = await tf.loadLayersModel('localstorage://performance-model');
        skillGapModel = await tf.loadLayersModel('localstorage://skill-gap-model');
        trendAnalysisModel = await tf.loadLayersModel('localstorage://trend-model');
        console.log('Models loaded from local storage');
    } catch (error) {
        console.log('No saved models found, will train new ones');
    }
}