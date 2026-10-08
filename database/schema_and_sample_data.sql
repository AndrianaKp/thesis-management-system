-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: web
-- ------------------------------------------------------
-- Server version	5.5.5-10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `announcements`
--

DROP TABLE IF EXISTS `announcements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `announcements` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `assignment_id` int(11) NOT NULL,
  `professor_id` int(11) NOT NULL,
  `text` text NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `assignment_id` (`assignment_id`),
  KEY `professor_id` (`professor_id`),
  CONSTRAINT `announcements_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `announcements_ibfk_2` FOREIGN KEY (`professor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `announcements`
--

LOCK TABLES `announcements` WRITE;
/*!40000 ALTER TABLE `announcements` DISABLE KEYS */;
/*!40000 ALTER TABLE `announcements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `assignments`
--

DROP TABLE IF EXISTS `assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assignments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `topic_id` int(11) NOT NULL,
  `student_id` int(11) NOT NULL,
  `status` enum('Pending','Active','UnderReview','Completed','Canceled') NOT NULL DEFAULT 'Pending',
  `start_date` date DEFAULT NULL,
  `completed_date` date DEFAULT NULL,
  `grading_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `repository_link` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_assignments_status` (`status`),
  KEY `idx_assignments_topic_id` (`topic_id`),
  KEY `idx_assignments_student_id` (`student_id`),
  CONSTRAINT `assignments_ibfk_1` FOREIGN KEY (`topic_id`) REFERENCES `topics` (`id`) ON DELETE CASCADE,
  CONSTRAINT `assignments_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `assignments`
--

LOCK TABLES `assignments` WRITE;
/*!40000 ALTER TABLE `assignments` DISABLE KEYS */;
/*!40000 ALTER TABLE `assignments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `assignmentstatushistory`
--

DROP TABLE IF EXISTS `assignmentstatushistory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assignmentstatushistory` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `assignment_id` int(11) NOT NULL,
  `status` enum('Pending','Active','UnderReview','Completed','Canceled') NOT NULL,
  `reason` text DEFAULT NULL,
  `gs_arithmos` int(11) DEFAULT NULL,
  `gs_etos` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_status_history_assignment_id` (`assignment_id`),
  CONSTRAINT `assignmentstatushistory_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `assignmentstatushistory`
--

LOCK TABLES `assignmentstatushistory` WRITE;
/*!40000 ALTER TABLE `assignmentstatushistory` DISABLE KEYS */;
/*!40000 ALTER TABLE `assignmentstatushistory` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `committeemembers`
--

DROP TABLE IF EXISTS `committeemembers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `committeemembers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `assignment_id` int(11) NOT NULL,
  `professor_id` int(11) NOT NULL,
  `role` enum('Supervisor','Member') NOT NULL,
  PRIMARY KEY (`id`),
  KEY `professor_id` (`professor_id`),
  KEY `idx_committee_assignment_id` (`assignment_id`),
  CONSTRAINT `committeemembers_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `committeemembers_ibfk_2` FOREIGN KEY (`professor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `committeemembers`
--

LOCK TABLES `committeemembers` WRITE;
/*!40000 ALTER TABLE `committeemembers` DISABLE KEYS */;
/*!40000 ALTER TABLE `committeemembers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `events`
--

DROP TABLE IF EXISTS `events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `assignment_id` int(11) NOT NULL,
  `date` datetime NOT NULL,
  `location` varchar(100) NOT NULL,
  `tropos_eksetasis` text NOT NULL,
  PRIMARY KEY (`id`),
  KEY `assignment_id` (`assignment_id`),
  CONSTRAINT `events_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `events`
--

LOCK TABLES `events` WRITE;
/*!40000 ALTER TABLE `events` DISABLE KEYS */;
/*!40000 ALTER TABLE `events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `grades`
--

DROP TABLE IF EXISTS `grades`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `grades` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `assignment_id` int(11) NOT NULL,
  `professor1_grade` decimal(5,2) DEFAULT NULL,
  `professor2_grade` decimal(5,2) DEFAULT NULL,
  `professor3_grade` decimal(5,2) DEFAULT NULL,
  `final_grade` decimal(5,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_grades_assignment` (`assignment_id`),
  KEY `idx_grades_assignment_id` (`assignment_id`),
  CONSTRAINT `grades_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `grades`
--

LOCK TABLES `grades` WRITE;
/*!40000 ALTER TABLE `grades` DISABLE KEYS */;
/*!40000 ALTER TABLE `grades` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invitations`
--

DROP TABLE IF EXISTS `invitations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invitations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `assignment_id` int(11) NOT NULL,
  `professor_id` int(11) NOT NULL,
  `student_id` int(11) NOT NULL,
  `status` enum('Pending','Accepted','Rejected') NOT NULL DEFAULT 'Pending',
  `sent_date` datetime DEFAULT current_timestamp(),
  `response_date` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `student_id` (`student_id`),
  KEY `idx_invitations_assignment_id` (`assignment_id`),
  KEY `idx_invitations_professor_id` (`professor_id`),
  KEY `idx_invitations_status` (`status`),
  CONSTRAINT `invitations_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `invitations_ibfk_2` FOREIGN KEY (`professor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `invitations_ibfk_3` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invitations`
--

LOCK TABLES `invitations` WRITE;
/*!40000 ALTER TABLE `invitations` DISABLE KEYS */;
/*!40000 ALTER TABLE `invitations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notes`
--

DROP TABLE IF EXISTS `notes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `assignment_id` int(11) NOT NULL,
  `professor_id` int(11) NOT NULL,
  `content` text NOT NULL,
  PRIMARY KEY (`id`),
  KEY `assignment_id` (`assignment_id`),
  KEY `professor_id` (`professor_id`),
  CONSTRAINT `notes_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `notes_ibfk_2` FOREIGN KEY (`professor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notes`
--

LOCK TABLES `notes` WRITE;
/*!40000 ALTER TABLE `notes` DISABLE KEYS */;
/*!40000 ALTER TABLE `notes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `secretarysubmissions`
--

DROP TABLE IF EXISTS `secretarysubmissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `secretarysubmissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `assignment_id` int(11) NOT NULL,
  `student_id` int(11) NOT NULL,
  `submission_date` datetime DEFAULT current_timestamp(),
  `ap_praktiko` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_secretary_submission_assignment_id` (`assignment_id`),
  KEY `idx_secretary_submission_student_id` (`student_id`),
  CONSTRAINT `secretarysubmissions_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `secretarysubmissions_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `secretarysubmissions`
--

LOCK TABLES `secretarysubmissions` WRITE;
/*!40000 ALTER TABLE `secretarysubmissions` DISABLE KEYS */;
/*!40000 ALTER TABLE `secretarysubmissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `submissions`
--

DROP TABLE IF EXISTS `submissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `submissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `assignment_id` int(11) NOT NULL,
  `pdf_draft` varchar(255) DEFAULT NULL,
  `supporting_materials` text DEFAULT NULL,
  `pdf_teliko` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_submissions_assignment_id` (`assignment_id`),
  CONSTRAINT `submissions_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `submissions`
--

LOCK TABLES `submissions` WRITE;
/*!40000 ALTER TABLE `submissions` DISABLE KEYS */;
/*!40000 ALTER TABLE `submissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `topics`
--

DROP TABLE IF EXISTS `topics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `topics` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `attachment` varchar(255) DEFAULT NULL,
  `professor_id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_topics_professor_id` (`professor_id`),
  CONSTRAINT `topics_ibfk_1` FOREIGN KEY (`professor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=65 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `topics`
--

LOCK TABLES `topics` WRITE;
/*!40000 ALTER TABLE `topics` DISABLE KEYS */;
INSERT INTO `topics` VALUES (1,'Topic 1: Data Science Research','Research on data science methodologies and applications.','data_science_attachment.pdf',16),(2,'Topic 2: Machine Learning Algorithms','Study of various machine learning algorithms and their applications.','machine_learning_attachment.pdf',16),(3,'Topic 3: Artificial Intelligence in Healthcare','The role of AI in healthcare improvement.','ai_healthcare_attachment.pdf',16),(4,'Topic 4: Blockchain Technology','Exploring the potential of blockchain technology in various sectors.','blockchain_attachment.pdf',16),(5,'Topic 5: Natural Language Processing','Study of natural language processing techniques for text analysis.','nlp_attachment.pdf',16),(6,'Topic 6: Cybersecurity Measures','Research on modern cybersecurity practices and protocols.','cybersecurity_attachment.pdf',16),(7,'Topic 7: Cloud Computing','A study on cloud computing platforms and their use cases.','cloud_computing_attachment.pdf',16),(8,'Topic 8: Big Data Analytics','Analysis of big data tools and technologies for large-scale data analysis.','big_data_attachment.pdf',16),(9,'Topic 1: Computer Vision','Study of computer vision techniques and applications in image recognition.','computer_vision_attachment.pdf',17),(10,'Topic 2: Data Privacy and Protection','Exploring methods for ensuring data privacy in the digital era.','data_privacy_attachment.pdf',17),(11,'Topic 3: Autonomous Systems','Research on autonomous systems and their impact on modern industries.','autonomous_systems_attachment.pdf',17),(12,'Topic 4: Internet of Things (IoT)','Investigating the integration and impact of IoT devices on everyday life.','iot_attachment.pdf',17),(13,'Topic 5: Cloud Security','Study of cloud security threats and solutions.','cloud_security_attachment.pdf',17),(14,'Topic 6: Smart Cities','Exploring the development of smart cities through technology and innovation.','smart_cities_attachment.pdf',17),(15,'Topic 7: Robotics and Automation','Research on robotics and automation technologies in industry.','robotics_attachment.pdf',17),(16,'Topic 8: Digital Transformation','Study on digital transformation in business and government.','digital_transformation_attachment.pdf',17),(17,'Topic 1: Software Development Life Cycle','Exploring the software development life cycle and its best practices.','software_life_cycle_attachment.pdf',18),(18,'Topic 2: Agile Methodologies in Software Engineering','Study of Agile methodologies and their applications in software engineering.','agile_attachment.pdf',18),(19,'Topic 3: Cloud Infrastructure','Research on cloud infrastructure services and their management.','cloud_infrastructure_attachment.pdf',18),(20,'Topic 4: IT Project Management','Exploring the key principles of IT project management for successful project execution.','it_project_management_attachment.pdf',18),(21,'Topic 5: Data Visualization','Study of techniques and tools used in data visualization.','data_visualization_attachment.pdf',18),(22,'Topic 6: Cyber-Physical Systems','Research on cyber-physical systems and their applications in various industries.','cyber_physical_attachment.pdf',18),(23,'Topic 7: Digital Payment Systems','Exploring the technology and evolution of digital payment systems.','digital_payment_attachment.pdf',18),(24,'Topic 8: Quantum Computing','Study on quantum computing and its potential future applications.','quantum_computing_attachment.pdf',18),(25,'Topic 1: Sustainable Development in IT','Research on sustainable development practices in IT infrastructure.','sustainable_it_attachment.pdf',19),(26,'Topic 2: Smart Grid Technologies','Exploring the development and implementation of smart grid technologies.','smart_grid_attachment.pdf',19),(27,'Topic 3: Green Computing','Study of energy-efficient computing practices for a greener future.','green_computing_attachment.pdf',19),(28,'Topic 4: E-Government Solutions','Research on electronic government systems and their implementation.','egovernment_attachment.pdf',19),(29,'Topic 5: Augmented Reality Applications','Study of the applications of augmented reality in various fields.','augmented_reality_attachment.pdf',19),(30,'Topic 6: Digital Marketing Strategies','Exploring digital marketing strategies in the modern business environment.','digital_marketing_attachment.pdf',19),(31,'Topic 7: Data Mining Techniques','Research on various data mining techniques and algorithms.','data_mining_attachment.pdf',19),(32,'Topic 8: Social Media Analytics','Study of social media data analytics for business intelligence.','social_media_analytics_attachment.pdf',19),(33,'Topic 1: Deep Learning Applications','Exploring applications of deep learning in various industries.','deep_learning_attachment.pdf',20),(34,'Topic 2: Natural Language Processing with Deep Learning','Study of NLP techniques using deep learning models.','nlp_deep_learning_attachment.pdf',20),(35,'Topic 3: Internet Security','Research on internet security protocols and prevention of cyberattacks.','internet_security_attachment.pdf',20),(36,'Topic 4: Augmented Reality in Education','Study of the use of augmented reality for educational purposes.','ar_education_attachment.pdf',20),(37,'Topic 5: Cloud-Based Data Storage','Exploring the role of cloud-based storage solutions in modern data management.','cloud_storage_attachment.pdf',20),(38,'Topic 6: AI for Business Optimization','Research on how AI can optimize business operations and decision making.','ai_business_attachment.pdf',20),(39,'Topic 7: Intelligent Transportation Systems','Study of intelligent systems used in transportation networks.','intelligent_transportation_attachment.pdf',20),(40,'Topic 8: Virtual Reality in Medicine','Exploring applications of virtual reality in medical fields.','vr_medicine_attachment.pdf',20),(41,'Topic 1: Internet of Things for Smart Homes','Study of IoT technologies used in smart homes.','iot_smart_homes_attachment.pdf',21),(42,'Topic 2: Wearable Technology','Exploring the potential of wearable technology in healthcare and everyday life.','wearable_technology_attachment.pdf',21),(43,'Topic 3: Data Analytics in Finance','Research on the application of data analytics in the financial industry.','finance_data_analytics_attachment.pdf',21),(44,'Topic 4: AI-Powered Marketing Tools','Study of AI-powered tools used in modern marketing strategies.','ai_marketing_tools_attachment.pdf',21),(45,'Topic 5: Cloud Robotics','Exploring the integration of cloud computing with robotics.','cloud_robotics_attachment.pdf',21),(46,'Topic 6: Data Privacy in Cloud Computing','Research on methods to ensure data privacy in cloud computing systems.','data_privacy_cloud_attachment.pdf',21),(47,'Topic 7: Bioinformatics','Study of bioinformatics applications in genomics and health.','bioinformatics_attachment.pdf',21),(48,'Topic 8: Digital Twins','Research on the concept of digital twins and their applications in various industries.','digital_twins_attachment.pdf',21),(49,'Topic 1: Cloud Computing Architecture','Research on the architecture and design of cloud computing systems.','cloud_computing_architecture.pdf',22),(50,'Topic 2: Data Center Management','Study of data center operations and management strategies.','data_center_management.pdf',22),(51,'Topic 3: Machine Learning in Financial Markets','Exploring machine learning algorithms used in financial markets analysis.','ml_financial_markets.pdf',22),(52,'Topic 4: Cybersecurity in Cloud Environments','Research on security risks and solutions for cloud environments.','cloud_security_risks.pdf',22),(53,'Topic 5: Internet of Things and Smart Cities','Study of IoT technologies used in the development of smart cities.','iot_smart_cities.pdf',22),(54,'Topic 6: AI in E-Commerce','Exploring the applications of AI technologies in e-commerce platforms.','ai_e_commerce.pdf',22),(55,'Topic 7: Augmented Reality for Product Visualization','Research on using augmented reality for product design and customer experience.','ar_product_visualization.pdf',22),(56,'Topic 8: Autonomous Vehicles','Study on autonomous vehicle technologies and their impact on transportation.','autonomous_vehicles.pdf',22),(57,'Topic 1: Digital Transformation in Healthcare','Exploring the role of digital transformation in the healthcare sector.','digital_healthcare_transformation.pdf',23),(58,'Topic 2: Artificial Intelligence for Predictive Analytics','Research on AI models for predictive analytics in business and healthcare.','ai_predictive_analytics.pdf',23),(59,'Topic 3: 5G Technology and its Applications','Study of 5G technology and its potential applications in various industries.','5g_technology.pdf',23),(60,'Topic 4: Robotics in Manufacturing','Exploring the use of robotics in modern manufacturing processes.','robotics_manufacturing.pdf',23),(61,'Topic 5: Blockchain for Supply Chain Management','Research on the application of blockchain technology in supply chain management.','blockchain_supply_chain.pdf',23),(62,'Topic 6: Edge Computing for Real-Time Data Processing','Study of edge computing and its use in real-time data processing.','edge_computing_real_time.pdf',23),(63,'Topic 7: Smart Healthcare Devices','Exploring the use of smart devices in the healthcare industry.','smart_healthcare_devices.pdf',23),(64,'Topic 8: Digital Payments and Cryptocurrencies','Study of digital payment systems and the impact of cryptocurrencies on financial transactions.','digital_payments_cryptocurrencies.pdf',23);
/*!40000 ALTER TABLE `topics` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `password` varchar(255) NOT NULL,
  `role` enum('Student','Professor','Admin') NOT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `phone` varchar(100) DEFAULT NULL,
  `landline_phone` varchar(32) DEFAULT NULL,
  `student_id` varchar(100) DEFAULT NULL,
  `address` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_users_email` (`email`),
  KEY `idx_users_student_id` (`student_id`),
  KEY `idx_users_role` (`role`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'hashed_password1','Student','John Smith','john.smith@example.com','6980000001',NULL,'AM0001','20 Limnou St'),(2,'hashed_password2','Student','Emily Johnson','emily.johnson@example.com','6980000002',NULL,'AM0002','15 Aristotelous St'),(3,'hashed_password3','Student','Michael Brown','michael.brown@example.com','6980000003',NULL,'AM0003','10 Korinthou St'),(4,'hashed_password4','Student','Sarah Davis','sarah.davis@example.com','6980000004',NULL,'AM0004','5 Kazantzaki St'),(5,'hashed_password5','Student','David Wilson','david.wilson@example.com','6980000005',NULL,'AM0005','25 Dodonis St'),(6,'hashed_password6','Student','Laura Moore','laura.moore@example.com','6980000006',NULL,'AM0006','12 Ogl St'),(7,'hashed_password7','Student','James Taylor','james.taylor@example.com','6980000007',NULL,'AM0007','30 Krinis St'),(8,'hashed_password8','Student','Sophia White','sophia.white@example.com','6980000008',NULL,'AM0008','18 Akadimias St'),(9,'hashed_password9','Student','Liam Green','liam.green@example.com','6980000009',NULL,'AM0009','22 Eratosthenous St'),(10,'hashed_password10','Student','Emma Harris','emma.harris@example.com','6980000010',NULL,'AM0010','8 Egnatias St'),(11,'hashed_password11','Student','Oliver Scott','oliver.scott@example.com','6980000011',NULL,'AM0011','14 Patission St'),(12,'hashed_password12','Student','Amelia Young','amelia.young@example.com','6980000012',NULL,'AM0012','9 Panepistimiou St'),(13,'hashed_password13','Student','Charlotte Evans','charlotte.evans@example.com','6980000013',NULL,'AM0013','11 Solomou St'),(14,'hashed_password14','Student','Noah Carter','noah.carter@example.com','6980000014',NULL,'AM0014','7 Venizelou St'),(15,'hashed_password15','Student','Mia Martinez','mia.martinez@example.com','6980000015',NULL,'AM0015','4 Pindarou St'),(16,'hashed_password16','Professor','William Brown','william.brown@example.com','2100000001',NULL,NULL,'3 Eleftheriou St'),(17,'hashed_password17','Professor','Sophia Adams','sophia.adams@example.com','2100000002',NULL,NULL,'6 Leoforos St'),(18,'hashed_password18','Professor','Benjamin Roberts','benjamin.roberts@example.com','2100000003',NULL,NULL,'12 Andrianou St'),(19,'hashed_password19','Professor','Chloe Clark','chloe.clark@example.com','2100000004',NULL,NULL,'20 Aristidou St'),(20,'hashed_password20','Professor','Ethan Perez','ethan.perez@example.com','2100000005',NULL,NULL,'15 Dionysiou St'),(21,'hashed_password21','Professor','Ava Lee','ava.lee@example.com','2100000006',NULL,NULL,'7 Zoodochou St'),(22,'hashed_password22','Professor','Lucas Hill','lucas.hill@example.com','2100000007',NULL,NULL,'18 Likavitou St'),(23,'hashed_password23','Professor','Isabella King','isabella.king@example.com','2100000008',NULL,NULL,'9 Dimokratias St'),(24,'hashed_password24','Admin','Admin User','admin.user@example.com','2102316489',NULL,NULL,'1 Athinas St');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-09-20  2:05:18
